[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('backup', 'verify', 'inventory', 'scan-migrations', 'restore-test')]
  [string]$Command,
  [string]$ArtifactRoot,
  [string]$Backup,
  [string]$Output,
  [string]$RestoreProject,
  [switch]$DryRun,
  [switch]$Cleanup
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$arguments = @((Join-Path $repositoryRoot 'tools/migration-safety/cli.cjs'), $Command)
if ($ArtifactRoot) { $arguments += @('--artifact-root', [System.IO.Path]::GetFullPath($ArtifactRoot)) }
if ($Backup) { $arguments += @('--backup', [System.IO.Path]::GetFullPath($Backup)) }
if ($Output) { $arguments += @('--output', [System.IO.Path]::GetFullPath($Output)) }
if ($RestoreProject) { $arguments += @('--restore-project', $RestoreProject) }
if ($DryRun) { $arguments += '--dry-run' }
if ($Cleanup) { $arguments += @('--cleanup', 'true') }

& node @arguments
if ($LASTEXITCODE -ne 0) { throw "Migration safety command failed with exit code $LASTEXITCODE" }
