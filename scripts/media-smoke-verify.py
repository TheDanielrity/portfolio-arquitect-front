"""Smoke-only verification through existing backend models/adapters; no backend edits."""

import argparse
import asyncio
import selectors
from sqlalchemy import select
from app.core.config import Settings
from app.core.database import Database
from app.modules.media.models import MediaAsset
from app.modules.media.operation_models import StorageOperation
from app.modules.media.dependencies import build_storage
from app.modules.media.upload_service import UploadService
from app.modules.media.storage_port import ObjectMissing
import app.models  # noqa: F401


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--phase", choices=["present", "clean"], required=True)
    args = parser.parse_args()
    if not args.name.startswith("frontend-media-smoke-"):
        raise RuntimeError("Smoke identity required")
    settings = Settings()
    database = Database(settings)
    storage = build_storage(settings)
    try:
        async with database.session() as session:
            assets = (
                await session.scalars(
                    select(MediaAsset).where(MediaAsset.original_filename == args.name)
                )
            ).all()
            operations = (
                await session.scalars(
                    select(StorageOperation).where(
                        StorageOperation.expected_metadata["original_filename"].astext
                        == args.name
                    )
                )
            ).all()
            if args.phase == "present":
                assert len(assets) == 1 and assets[0].storage_provider == "r2"
                assert len(operations) == 1 and operations[0].status == "COMPLETED"
                await storage.head(assets[0].storage_key)
                print("PostgreSQL registration and definitive R2 object: OK")
            else:
                service = UploadService(session, storage, settings)
                for asset in assets:
                    owner = next(
                        op.created_by for op in operations if op.media_id == asset.id
                    )
                    await service.delete(asset.id, owner)
                remaining = (
                    await session.scalars(
                        select(MediaAsset).where(
                            MediaAsset.original_filename == args.name
                        )
                    )
                ).all()
                assert not remaining, "Temporary asset remains"
                for operation in operations:
                    if operation.status in {"PENDING", "PROCESSING", "CLEANUP_PENDING"}:
                        await service.cancel(operation.id, operation.created_by)
                    assert operation.status in {"COMPLETED", "CANCELLED", "CLEANED"}, (
                        "Unresolved operation remains"
                    )
                    # Completed upload staging is normally retained until expiry + grace.
                    # Remove only this named smoke's staging bytes after browser transfer ended.
                    if operation.temporary_key:
                        await storage.delete(operation.temporary_key)
                    for key in [operation.storage_key, operation.temporary_key]:
                        if key:
                            try:
                                await storage.head(key)
                            except ObjectMissing:
                                pass
                            else:
                                raise RuntimeError("Smoke object remains")
                ids = [
                    operation.media_id for operation in operations if operation.media_id
                ]
                if ids:
                    deletions = (
                        await session.scalars(
                            select(StorageOperation).where(
                                StorageOperation.kind == "DELETE",
                                StorageOperation.media_id.in_(ids),
                            )
                        )
                    ).all()
                    for deletion in deletions:
                        if deletion.status == "CLEANUP_PENDING":
                            assert await service.reconcile(deletion.id)
                        assert deletion.status == "COMPLETED", (
                            "Pending deletion remains"
                        )
                print("Cleanup PostgreSQL + R2 definitive/staging objects: OK")
    finally:
        await database.dispose()


asyncio.run(
    main(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector())
)
