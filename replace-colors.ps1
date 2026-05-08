# Color replacement script for React TSX files
$replacements = @{
    "border-gray-100" = "border-gray-200/50"
    "bg-gray-50" = "bg-white"
    "text-gray-600" = "text-gray-700"
    "bg-gray-100" = "bg-gray-50"
}

# Get all TSX files
$files = @()
$files += Get-ChildItem -Path "src/App.tsx" -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path "src/components/*.tsx" -Recurse

Write-Host "Processing $($files.Count) files..." -ForegroundColor Cyan
Write-Host ""

# Process each file
foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw
    $originalContent = $content
    
    # Apply all replacements
    foreach ($pattern in $replacements.GetEnumerator()) {
        $content = $content -replace [regex]::Escape($pattern.Key), $pattern.Value
    }
    
    # Only write if changes were made
    if ($originalContent -ne $content) {
        Set-Content -Path $file.FullName -Value $content
        Write-Host "? Updated: $($file.FullName)" -ForegroundColor Green
        
        # Show what was replaced
        $changes = 0
        
        foreach ($pattern in $replacements.GetEnumerator()) {
            $matchCount = ([regex]::Matches($originalContent, [regex]::Escape($pattern.Key))).Count
            if ($matchCount -gt 0) {
                Write-Host "    - Replaced '$($pattern.Key)' with '$($pattern.Value)': $matchCount occurrences" -ForegroundColor Gray
                $changes += $matchCount
            }
        }
    }
}

Write-Host ""
Write-Host "Replacement complete!" -ForegroundColor Green
