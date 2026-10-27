$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$rootPrefix = [IO.Path]::GetFullPath($root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:4173/")
$listener.Start()
Write-Host "Gather is available at http://localhost:4173/ (Ctrl+C to stop)"
$contentTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css" = "text/css; charset=utf-8"
    ".js" = "text/javascript; charset=utf-8"
}
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
        if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = "index.html" }
        $filePath = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $relativePath))
        if (-not $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            $context.Response.StatusCode = 404
            $context.Response.Close()
            continue
        }
        $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
        $contentType = $contentTypes[$extension]
        if (-not $contentType) { $contentType = "application/octet-stream" }
        $bytes = [IO.File]::ReadAllBytes($filePath)
        $context.Response.ContentType = $contentType
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $context.Response.Close()
    }
}
finally {
    $listener.Stop()
}
