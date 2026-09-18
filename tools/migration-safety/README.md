# Migration safety tooling

This tooling is read-only against the source CRM database and object store. It creates uniquely named backup directories outside the repository and refuses non-local Docker contexts, missing Compose services, Production-like project names, ambiguous targets, and source/restore identity overlap.

Use the PowerShell wrapper on Windows:

```powershell
.\scripts\migration-safety.ps1 backup -DryRun
.\scripts\migration-safety.ps1 backup -ArtifactRoot E:\iam-crm-safety-artifacts
.\scripts\migration-safety.ps1 verify -Backup E:\iam-crm-safety-artifacts\<backup-id>
.\scripts\migration-safety.ps1 restore-test -Backup E:\iam-crm-safety-artifacts\<backup-id> -Cleanup
```

The Bash wrapper accepts the same CLI options:

```bash
./scripts/migration-safety.sh backup --dry-run
```

MinIO backup uses `minio/mc mirror --preserve`; every copied object is individually checksummed in the manifest. The current Compose bucket is not versioned, so historical object versions are not applicable. If versioning is enabled later, the tooling must be extended and revalidated before it can claim preservation of all versions.

The migration scanner is advisory. Findings identify patterns requiring human review; absence of a finding is not proof of safety.
