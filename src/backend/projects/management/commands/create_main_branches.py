"""
Give every project from before branches its main branch: the project's data
moves into a branch called "main", and the project's own copy is cleared.
Idempotent, so it runs on every container start before any request is served.

Run:  python manage.py create_main_branches --dry-run
      python manage.py create_main_branches
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from projects.models import Branch, Project


class Command(BaseCommand):
    help = "Move each project's data into a main branch."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Count without saving")

    def handle(self, *args, **opts):
        todo = Project.objects.filter(main_branch__isnull=True).order_by("id")
        if opts["dry_run"]:
            self.stdout.write(f"Would create {todo.count()} main branches")
            return
        created = 0
        for project in todo.iterator():
            with transaction.atomic():
                main = Branch.objects.create(project=project, name="main", data=project.data or {})
                # Updates, not saves: the branch dates the project's history and
                # the project keeps its place in its owner's list
                Branch.objects.filter(pk=main.pk).update(created_at=project.created_at, updated_at=project.updated_at)
                Project.objects.filter(pk=project.pk).update(main_branch=main, active_branch=main, data=None)
            created += 1
        self.stdout.write(self.style.SUCCESS(f"Created {created} main branches"))
