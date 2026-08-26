#requires -Version 5.1
<#
.SYNOPSIS
    Publie un instantane du depot vers le miroir public GitHub.

.DESCRIPTION
    Le miroir public ne partage PAS l'historique de ce depot : celui-ci porte l'identite
    reelle de l'auteur dans chaque commit (nom, adresse), ce qu'aucune modification de
    fichier ne peut effacer. Le miroir recoit donc des instantanes : a chaque publication,
    le contenu suivi par git remplace celui du miroir, et un seul commit resume le
    changement.

    Deroulement :
      1. clone du miroir public dans un dossier temporaire ;
      2. remplacement de son contenu par `git archive HEAD` de CE depot (donc les
         fichiers suivis uniquement : ni .git, ni node_modules, ni fichiers ignores) ;
      3. CONTROLE DE CONFIDENTIALITE bloquant (voir -Forbidden) ;
      4. commit + push.

    A lancer depuis n'importe ou :  .\scripts\sync-public.ps1 -Message "..."

    Prerequis : un remote nomme 'public' pointant sur le miroir, ou -PublicUrl.
      git remote add public https://github.com/<compte>/<depot>.git

.EXAMPLE
    .\scripts\sync-public.ps1
    Publie avec, comme message, le sujet du dernier commit local.

.EXAMPLE
    .\scripts\sync-public.ps1 -Message "Image Docker publique" -DryRun
    Montre le diff et joue le controle de confidentialite, sans rien pousser.
#>
[CmdletBinding()]
param(
    # Message du commit public. Par defaut, le sujet du dernier commit local : les messages
    # detailles de ce depot restent internes, seul le sujet est repris.
    [string]$Message,
    # URL du miroir. Par defaut, celle du remote 'public'.
    [string]$PublicUrl,
    # Identite de commit du miroir. A ne PAS laisser deduire de la config locale : ce serait
    # reintroduire dans le miroir public l'identite qu'on cherche a en tenir a l'ecart.
    [string]$UserName = 'fuzzinvaders',
    [string]$UserEmail = 'talva.cn@gmail.com',
    # Motifs interdits dans les fichiers publies (expression reguliere, insensible a la casse).
    # PAS de valeur par defaut ici : ce fichier part lui-meme dans le miroir public, il y
    # publierait donc exactement ce que le controle sert a bloquer. Les motifs sont lus dans
    # scripts/forbidden-patterns.txt, ignore par git (voir le .example fourni). Sans motifs,
    # le script REFUSE de publier : un controle absent ne doit jamais ressembler a un controle
    # reussi.
    [string]$Forbidden,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Racine du depot = dossier parent de scripts/
$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-GitValue([string[]]$GitArgs) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $out = (& git @GitArgs 2>$null | Select-Object -First 1) } finally { $ErrorActionPreference = $previous }
    if ($out) { return $out.ToString().Trim() }
    return $null
}

<#
    Appelle git en tolerant sa sortie d'erreur.

    Sous Windows PowerShell 5.1, tout ce que git ecrit sur stderr (y compris de simples
    avertissements, ex. "LF will be replaced by CRLF") devient un ErrorRecord ; combine a
    $ErrorActionPreference = 'Stop', cela faisait echouer le script alors que git avait
    reussi. On neutralise donc la preference le temps de l'appel et on ne regarde que le
    code de sortie. Meme raisonnement que dans sync-wiki.ps1.
#>
function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$FailureMessage,
        [switch]$Check
    )
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

if (-not $PublicUrl) {
    $PublicUrl = Get-GitValue @('-C', $repoRoot, 'remote', 'get-url', 'public')
    if (-not $PublicUrl) {
        throw "Aucun remote 'public'. Ajoute-le une fois :`n" +
              "  git remote add public https://github.com/<compte>/<depot>.git`n" +
              "ou passe -PublicUrl."
    }
}

if (-not $Message) {
    $Message = Get-GitValue @('-C', $repoRoot, 'log', '-1', '--pretty=%s')
    if (-not $Message) { throw "Impossible de lire le dernier commit : precise -Message." }
}

# Motifs interdits : fichier local ignore par git, une expression reguliere par ligne
# (les lignes vides et celles commencant par # sont ignorees).
if (-not $Forbidden) {
    $patternFile = Join-Path $PSScriptRoot 'forbidden-patterns.txt'
    if (-not (Test-Path $patternFile)) {
        throw ("Aucun motif de confidentialite : $patternFile est absent.`n" +
               "Copie forbidden-patterns.example.txt en forbidden-patterns.txt et renseigne-le.`n" +
               "Publier sans ce controle est refuse volontairement.")
    }
    $lines = Get-Content $patternFile | ForEach-Object { $_.Trim() } |
             Where-Object { $_ -and -not $_.StartsWith('#') }
    if (-not $lines) { throw "Aucun motif utilisable dans $patternFile." }
    $Forbidden = ($lines -join '|')
}

$sourceCommit = Get-GitValue @('-C', $repoRoot, 'rev-parse', '--short', 'HEAD')

# Refuse de publier un arbre de travail sale : l'instantane vient de HEAD, pas du disque.
# Sans ce garde-fou, on croirait publier ses modifications en cours alors qu'elles seraient
# silencieusement ignorees.
$dirty = & git -C $repoRoot status --porcelain
if ($dirty) {
    throw ("Arbre de travail modifie : l'instantane est pris sur HEAD ($sourceCommit), " +
           "les changements non committes ne seraient PAS publies. Committe d'abord.")
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("tentacle-public-" + [System.Guid]::NewGuid().ToString('N').Substring(0,8))
Write-Host "Clone du miroir public dans $tmp ..." -ForegroundColor Cyan

try {
    Invoke-Git -Check -Arguments @('-c', 'core.autocrlf=false', 'clone', '--quiet', $PublicUrl, $tmp) `
        -FailureMessage "Echec du clone de $PublicUrl." | Out-Null

    Invoke-Git -Arguments @('-C', $tmp, 'config', 'user.name',  $UserName)  | Out-Null
    Invoke-Git -Arguments @('-C', $tmp, 'config', 'user.email', $UserEmail) | Out-Null
    Invoke-Git -Arguments @('-C', $tmp, 'config', 'core.autocrlf', 'false') | Out-Null

    # Vide le clone (hors .git) : sans cela, un fichier supprime ici survivrait dans le miroir.
    Get-ChildItem -Path $tmp -Force |
        Where-Object { $_.Name -ne '.git' } |
        Remove-Item -Recurse -Force

    # Contenu suivi par git a HEAD, exporte tel quel dans le clone.
    # `git archive` respecte .gitattributes et exclut .git, node_modules et tout fichier ignore.
    $tar = Join-Path $tmp '..\tentacle-public-snapshot.tar'
    Invoke-Git -Check -Arguments @('-C', $repoRoot, 'archive', '--format=tar', '-o', $tar, 'HEAD') `
        -FailureMessage "Echec de l'export de HEAD." | Out-Null
    & tar -x -f $tar -C $tmp
    if ($LASTEXITCODE -ne 0) { throw "Echec de l'extraction de l'instantane." }
    Remove-Item $tar -Force -ErrorAction SilentlyContinue

    Invoke-Git -Check -Arguments @('-C', $tmp, 'add', '-A') | Out-Null

    # --- Controle de confidentialite, sur le contenu reellement mis en scene ---
    # -I ignore les binaires, --cached lit l'index (donc exactement ce qui serait pousse).
    # git grep : 0 = correspondances trouvees, 1 = aucune, >=2 = ECHEC de la commande.
    # Confondre 2 avec 1 donnerait un feu vert alors que le controle n'a pas tourne.
    # Les options doivent preceder le motif, sinon git refuse (--cached apres le motif = fatal).
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $hits = & git -C $tmp grep -I -n -i --cached -E -- $Forbidden
        $grepCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($grepCode -ge 2) {
        throw ("Le controle de confidentialite n'a pas pu s'executer (git grep, code $grepCode). " +
               "Publication refusee : sans controle, on ne publie pas.")
    }
    if ($grepCode -eq 0) {
        Write-Host ""
        Write-Host "PUBLICATION REFUSEE - motifs interdits trouves :" -ForegroundColor Red
        $hits | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        throw "Corrige ces occurrences (motifs : $Forbidden) avant de publier."
    }
    Write-Host "Controle de confidentialite : aucune occurrence de [$Forbidden]." -ForegroundColor Green

    $noChange = (Invoke-Git -Arguments @('-C', $tmp, 'diff', '--cached', '--quiet')) -eq 0
    if ($noChange) {
        Write-Host "Le miroir public est deja a jour, rien a pousser." -ForegroundColor Yellow
        return
    }

    Write-Host "Fichiers concernes :" -ForegroundColor Cyan
    Invoke-Git -Arguments @('-C', $tmp, 'diff', '--cached', '--stat') | Out-Null

    if ($DryRun) {
        Write-Host "-DryRun : rien n'a ete committe ni pousse." -ForegroundColor Yellow
        return
    }

    Invoke-Git -Check -Arguments @('-C', $tmp, 'commit', '--quiet', '-m', $Message) | Out-Null
    Invoke-Git -Check -Arguments @('-C', $tmp, 'push', '--quiet', 'origin', 'HEAD') `
        -FailureMessage "Echec du push vers le miroir public." | Out-Null

    $publicCommit = Get-GitValue @('-C', $tmp, 'rev-parse', '--short', 'HEAD')
    Write-Host ("Publie : $sourceCommit (local) -> $publicCommit (public) sur " +
                ($PublicUrl -replace '\.git$', '')) -ForegroundColor Green
}
finally {
    if (Test-Path $tmp) {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
}
