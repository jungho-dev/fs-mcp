/**
 * @file src/cores/runtime/runtime-guidance.ts
 * @description Runtime guidance builders derived from system information.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type {SystemInfo} from "@cores/runtime/runtime-info";

// 1. Get os specific guidance ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getOSSpecificGuidance(systemInfo: SystemInfo): string {
  const {platformName, defaultShell, isWindows, docker} = systemInfo;

  let guidance = `Running on ${platformName}. Default shell: ${defaultShell}.`;

  // Container-specific guidance
  if (docker.isContainer) {
    const cntnTypLbl = docker.containerType === "kubernetes" ? "KUBERNETES POD" : docker.containerType === "docker" ? "DOCKER CONTAINER" : docker.containerType === "podman" ? "PODMAN CONTAINER" : docker.containerType === "lxc" ? "LXC CONTAINER" : docker.containerType === "systemd-nspawn" ? "SYSTEMD-NSPAWN CONTAINER" : "CONTAINER";

    guidance += `

${cntnTypLbl} ENVIRONMENT DETECTED:`;

    if (docker.containerType === "kubernetes") {
      guidance += `
This fs-mcp instance is running inside a Kubernetes pod.`;

      // Add Kubernetes-specific info
      if (docker.containerEnvironment?.kubernetesNamespace) {
        guidance += `
Namespace: ${docker.containerEnvironment.kubernetesNamespace}`;
      }
      if (docker.containerEnvironment?.kubernetesPod) {
        guidance += `
Pod: ${docker.containerEnvironment.kubernetesPod}`;
      }
      if (docker.containerEnvironment?.kubernetesNode) {
        guidance += `
Node: ${docker.containerEnvironment.kubernetesNode}`;
      }
    }
    else if (docker.containerType === "docker") {
      guidance += `
This fs-mcp instance is running inside a Docker container.`;

      if (docker.orchestrator === "docker-compose") {
        guidance += ` (Docker Compose)`;
      }
      else if (docker.orchestrator === "docker-swarm") {
        guidance += ` (Docker Swarm)`;
      }
    }
    else {
      guidance += `
This fs-mcp instance is running inside a ${docker.containerType || "container"} environment.`;
    }
    if (docker.mountPoints.length > 0) {
      guidance += `

AVAILABLE MOUNTED DIRECTORIES:`;
      for (const mount of docker.mountPoints) {
        const access = mount.readOnly ? "(read-only)" : "(read-write)";
        guidance += `
- ${mount.containerPath} ${access} - ${mount.description}`;
      }
      guidance += `

IMPORTANT: When users ask about files, FIRST check mounted directories above.
Files outside these paths will be lost when the container stops.
Always suggest using mounted directories for file operations.

PATH TRANSLATION IN DOCKER:
When users provide host paths, translate to container paths:

Windows: "<drive>:\\projects\\data\\file.txt" → "/home/projects/data/file.txt"
Linux/Mac: "/Users/john/projects/data/file.txt" → "/home/projects/data/file.txt"

Rules: Remove drive letter/user prefix, keep full folder structure, mount to /home/

NOTE: fs-mcp Docker installer mounts host folders to /home/[folder-name].`;
    }
    else {
      guidance += `

WARNING: No mounted directories detected.
Files created outside mounted volumes will be lost when the container stops.
Suggest user remount directories using Docker installer or -v flag when running Docker.
fs-mcp Docker installer typically mounts folders to /home/[folder-name].`;
    }
    if (docker.containerEnvironment?.containerName) {
      guidance += `
Container: ${docker.containerEnvironment.containerName}`;
    }
  }
  if (isWindows) {
    guidance += `

WINDOWS-SPECIFIC TROUBLESHOOTING:
- If Node.js/Python commands fail with "not recognized" errors:
  * Try different shells: specify shell parameter as "cmd" or "pwsh.exe"
  * pwsh.exe may have execution policy restrictions for some tools
  * CMD typically has better compatibility with development tools
  * Use set_config_value to change defaultShell if needed
- Windows services and processes use different commands (Get-Process vs ps)
- Package managers: choco, winget, scoop instead of apt/brew
- Environment variables: $env:VAR instead of $VAR
- File permissions work differently than Unix systems`;
  }
  else if (systemInfo.isMacOS) {
    guidance += `

MACOS-SPECIFIC NOTES:
- Package manager: brew (Homebrew) is commonly used
- Python 3 might be 'python3' command, not 'python'
- Some GNU tools have different names (e.g., gsed instead of sed)
- System Integrity Protection (SIP) may block certain operations
- Use 'open' command to open files/applications from terminal
- For file search: Use mdfind (Spotlight) for fastest exact filename searches`;
  }
  else {
    guidance += `

LINUX-SPECIFIC NOTES:
- Package managers vary by distro: apt, yum, dnf, pacman, zypper
- Python 3 might be 'python3' command, not 'python'
- Standard Unix shell tools available (grep, awk, sed, etc.)
- File permissions and ownership important for many operations
- Systemd services common on modern distributions`;
  }
  return guidance;
}

// 2. Get path guidance ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getPathGuidance(systemInfo: SystemInfo): string {
  let guidance = `Always use absolute paths for reliability. Paths are automatically normalized regardless of slash direction.`;

  if (systemInfo.docker.isContainer && systemInfo.docker.mountPoints.length > 0) {
    const cntnLbl = systemInfo.docker.containerType === "kubernetes" ? "KUBERNETES" : systemInfo.docker.containerType === "docker" ? "DOCKER" : systemInfo.docker.containerType === "podman" ? "PODMAN" : "CONTAINER";

    guidance += `

${cntnLbl}: Prefer paths within mounted directories: ${systemInfo.docker.mountPoints.map((m) => m.containerPath).join(", ")}.
When users ask about file locations, check these mounted paths first.`;
  }
  return guidance;
}
