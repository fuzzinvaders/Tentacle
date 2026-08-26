#requires -Version 5.1
<#
.SYNOPSIS
    Publie le contenu de wiki/*.md vers le wiki Gitea (Tentacle.wiki.git).

.DESCRIPTION
    Clone le depot wiki dans un dossier temporaire, y recopie les pages
    versionnees dans wiki/, committe les changements et pousse.
    A lancer depuis n'importe ou :  .\scripts\sync-wiki.ps1

    Prerequis : le wiki doit avoir ete active + initialise une premiere fois
    dans l'interface Gitea (sinon le depot wiki renvoie une erreur 500).
#>
[CmdletBinding()]
param(
    [string]$Message = "Mise a jour de la documentation",
    # URL du depot wiki. Par defaut, DEDUITE du remote 'origin' : sur Gitea comme sur GitHub, le
    # wiki d'un depot est <depot>.wiki.git. Rien n'est donc code en dur, et le script fonctionne
    # sur n'importe quelle instance.
    [string]$WikiUrl,
    # Identite de commit du wiki. Par defaut, celle configuree pour ce depot.
    [string]$UserName,
    [string]$UserEmail
)

$ErrorActionPreference = 'Stop'

# Racine du depot = dossier parent de scripts/
$repoRoot = Split-Path -Parent $PSScriptRoot
$wikiSrc  = Join-Path $repoRoot 'wiki'

function Get-GitValue([string[]]$GitArgs) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $out = (& git @GitArgs 2>$null | Select-Object -First 1) } finally { $ErrorActionPreference = $previous }
    if ($out) { return $out.ToString().Trim() }
    return $null
}

if (-not $WikiUrl) {
    $origin = Get-GitValue @('-C', $repoRoot, 'remote', 'get-url', 'origin')
    if (-not $origin) { throw "Aucun remote 'origin' : precise -WikiUrl." }
    $WikiUrl = ($origin -replace '\.git$', '') + '.wiki.git'
}
if (-not $UserName)  { $UserName  = Get-GitValue @('-C', $repoRoot, 'config', 'user.name') }
if (-not $UserEmail) { $UserEmail = Get-GitValue @('-C', $repoRoot, 'config', 'user.email') }
$wikiUrl = $WikiUrl

<#
    Appelle git en tolerant sa sortie d'erreur.

    Sous Windows PowerShell 5.1, tout ce que git ecrit sur stderr (y compris de
    simples avertissements, ex. « LF will be replaced by CRLF ») est transforme en
    ErrorRecord ; combine a $ErrorActionPreference = 'Stop', cela faisait echouer
    le script alors que git avait parfaitement reussi. On neutralise donc la
    preference le temps de l'appel et on se fie uniquement au code de sortie.

    Renvoie le code de sortie de git ; -Check leve une exception si != 0.
#>
function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$FailureMessage,
        [switch]$Check
    )
    # NB : pas de redirection 2>&1 ici — sous 5.1 elle transforme chaque ligne de
    # stderr en NativeCommandError. On laisse git ecrire ses avertissements et on ne
    # regarde que son code de sortie.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & git @Arguments
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }
    if ($Check -and $code -ne 0) {
        if ($FailureMessage) { throw $FailureMessage }
        throw "Echec de : git $($Arguments -join ' ') (code $code)"
    }
    return $code
}

if (-not (Test-Path $wikiSrc)) {
    throw "Dossier source introuvable : $wikiSrc"
}

$mdFiles = Get-ChildItem -Path $wikiSrc -Filter *.md -File
if ($mdFiles.Count -eq 0) {
    throw "Aucun fichier .md dans $wikiSrc"
}

# Dossier temporaire pour le clone du wiki
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("tentacle-wiki-" + [System.Guid]::NewGuid().ToString('N').Substring(0,8))
Write-Host "Clone du wiki dans $tmp ..." -ForegroundColor Cyan

try {
    # core.autocrlf=false : les pages restent en LF cote wiki (et pas d'avertissement).
    Invoke-Git -Check -Arguments @('-c', 'core.autocrlf=false', 'clone', '--quiet', $wikiUrl, $tmp) `
        -FailureMessage "Echec du clone. Le wiki Gitea est-il active et initialise (une premiere page creee) ?" | Out-Null

    # Identite de commit locale au clone
    if ($UserName)  { Invoke-Git -Arguments @('-C', $tmp, 'config', 'user.name',  $UserName)  | Out-Null }
    if ($UserEmail) { Invoke-Git -Arguments @('-C', $tmp, 'config', 'user.email', $UserEmail) | Out-Null }
    Invoke-Git -Arguments @('-C', $tmp, 'config', 'core.autocrlf', 'false')   | Out-Null

    # Recopie des pages (ecrase les versions du wiki)
    Copy-Item -Path (Join-Path $wikiSrc '*.md') -Destination $tmp -Force

    Invoke-Git -Check -Arguments @('-C', $tmp, 'add', '-A') | Out-Null

    # Rien a committer ? (diff --cached renvoie 0 quand l'index est identique a HEAD)
    $noChange = (Invoke-Git -Arguments @('-C', $tmp, 'diff', '--cached', '--quiet')) -eq 0
    if ($noChange) {
        Write-Host "Le wiki est deja a jour, rien a pousser." -ForegroundColor Yellow
        return
    }

    Invoke-Git -Check -Arguments @('-C', $tmp, 'commit', '--quiet', '-m', $Message) | Out-Null
    Invoke-Git -Check -Arguments @('-C', $tmp, 'push', '--quiet', 'origin', 'HEAD') `
        -FailureMessage "Echec du push vers le wiki." | Out-Null

    Write-Host ("Wiki publie : " + ($wikiUrl -replace '\.wiki\.git$', '/wiki')) -ForegroundColor Green
}
finally {
    if (Test-Path $tmp) {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
}
