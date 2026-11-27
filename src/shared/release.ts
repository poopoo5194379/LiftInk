export function desktopRelease(platform: string, arch: string): 'win-x64' | 'mac-arm64' | 'mac-x64' | null {
  if (platform === 'win32' && arch === 'x64') return 'win-x64'
  if (platform === 'darwin' && arch === 'arm64') return 'mac-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'mac-x64'
  return null
}
