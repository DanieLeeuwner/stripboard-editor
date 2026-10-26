"""Branches of a project: what the API says about them, and the shared
pieces of creating, copying and merging them."""

import copy
import gzip
import json
import logging

from rest_framework import serializers

from .migrations_data.pipeline import migrate_to_current
from .models import Branch, BranchMerge

_log = logging.getLogger(__name__)

MAX_PROJECT_DATA_BYTES = 1024_000  # 1MB
MAX_BRANCHES_PER_PROJECT = 50
MAX_BRANCH_NAME = 80


def clean_data(value):
    """Incoming project data: size-checked, then brought to the current schema."""
    if not isinstance(value, dict):
        raise serializers.ValidationError("Expected an object")
    size = len(json.dumps(value).encode("utf-8"))
    if size > MAX_PROJECT_DATA_BYTES:
        raise serializers.ValidationError(
            f"Project data too large ({size} bytes). Maximum is {MAX_PROJECT_DATA_BYTES} bytes."
        )
    try:
        migrated, _ = migrate_to_current(value)
        return migrated
    except Exception:
        _log.exception("migration save-hook failed")
        return value


def readable(data, name):
    """Stored data as the editor reads it: on the current schema (never
    written back) and carrying the project's name, which lives on the project."""
    if not isinstance(data, dict):
        return data
    try:
        data, _ = migrate_to_current(copy.deepcopy(data))
    except Exception:
        _log.exception("migration read-hook failed")
        data = copy.deepcopy(data)
    data["name"] = name
    return data


def gz(data):
    return gzip.compress(json.dumps(data).encode("utf-8"))


def ungz(blob):
    return json.loads(gzip.decompress(bytes(blob))) if blob else None


def version(branch):
    """A branch's state as merges see it: changes with every save."""
    return branch.updated_at.isoformat()


def branch_json(branch, main_id, last_sync=None):
    """A branch as the history list and graph show it. A parent in another
    project (a fork's main) is reported as `upstream`, never by its id here.
    `parent_changed`: the parent was saved after the two last met (the
    branch's start or their last merge), so it has changes to take in."""
    parent = branch.parent
    same_project = parent is not None and parent.project_id == branch.project_id
    synced = max(branch.created_at, last_sync) if last_sync else branch.created_at
    return {
        "id": str(branch.id),
        "name": branch.name,
        "parent": str(branch.parent_id) if same_project else None,
        "upstream": parent is not None and not same_project,
        "is_main": branch.id == main_id,
        "parent_changed": parent is not None and branch.closed_at is None and parent.updated_at > synced,
        "closed_at": branch.closed_at,
        "created_at": branch.created_at,
        "updated_at": branch.updated_at,
    }


def merge_json(merge):
    return {
        "source": str(merge.source_id) if merge.source_id else None,
        "target": str(merge.target_id) if merge.target_id else None,
        "source_name": merge.source_name,
        "target_name": merge.target_name,
        "created_at": merge.created_at,
    }


def history_json(project):
    """Branches and merges of a project, for the branch list and the graph."""
    branches = project.branches.select_related("parent").all()
    merges = list(project.merges.all())
    # When each branch and its parent last met in a merge, either way round
    last_sync = {}
    for m in merges:
        for key in ((m.source_id, m.target_id), (m.target_id, m.source_id)):
            last_sync[key] = max(last_sync.get(key, m.created_at), m.created_at)
    return {
        "branches": [branch_json(b, project.main_branch_id, last_sync.get((b.id, b.parent_id))) for b in branches],
        "merges": [merge_json(m) for m in merges],
    }


def copy_history(source, target):
    """Gives `target` a copy of every branch and merge of `source`. The main
    branch keeps its parent, so a copy of a fork still follows the original."""
    ids = {}
    pending = list(source.branches.all())
    own = {b.id for b in pending}
    # Parents before children, so every copied parent exists when its child is made
    while pending:
        rest = []
        for b in pending:
            local_parent = b.parent_id in own
            if local_parent and b.parent_id not in ids:
                rest.append(b)
                continue
            new = Branch.objects.create(
                project=target, name=b.name, data=copy.deepcopy(b.data), base_gz=b.base_gz, closed_at=b.closed_at,
                parent_id=ids[b.parent_id] if local_parent else b.parent_id,
            )
            # The graph is drawn by time: the copy keeps the original's
            Branch.objects.filter(pk=new.pk).update(created_at=b.created_at, updated_at=b.updated_at)
            ids[b.id] = new.id
        if len(rest) == len(pending):
            raise ValueError("branch parents form a cycle")
        pending = rest
    for m in source.merges.all():
        new = BranchMerge.objects.create(
            project=target, source_id=ids.get(m.source_id, m.source_id), target_id=ids.get(m.target_id),
            source_name=m.source_name, target_name=m.target_name,
        )
        BranchMerge.objects.filter(pk=new.pk).update(created_at=m.created_at)
    target.main_branch_id = ids.get(source.main_branch_id)
    target.active_branch_id = ids.get(source.active_branch_id, target.main_branch_id)
    target.save(update_fields=["main_branch", "active_branch"])


def merge_pair(target, source):
    """How `source` merges into `target`, or None when they are not a branch
    and its parent: "from-parent" takes the parent's changes into the branch,
    "into-parent" hands a branch's changes to its parent. A fork's main only
    takes changes from the original."""
    if source.id == target.parent_id:
        return "from-parent"
    if source.parent_id == target.id and source.project_id == target.project_id:
        return "into-parent"
    return None
