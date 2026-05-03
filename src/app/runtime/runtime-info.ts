/**
 * @file src/app/runtime/runtime-info.ts
 * @description Runtime environment information.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DOCKER_CGROUP_CONTAINER_ID_REGEX = /docker\/([a-f0-9]{64})/;

export interface DockerMount {
  hostPath: string;
  containerPath: string;
  type: "bind" | "volume";
  readOnly: boolean;
  description: string;
}

export interface ContainerInfo {
  // New enhanced detection
  isContainer: boolean;
  containerType: "docker" | "podman" | "kubernetes" | "lxc" | "systemd-nspawn" | "other" | null;
  orchestrator: "kubernetes" | "docker-compose" | "docker-swarm" | "podman-compose" | null;
  // Backward compatibility
  isDocker: boolean;
  mountPoints: DockerMount[];
  containerEnvironment?: {
    dockerImage?: string;
    containerName?: string;
    hostPlatform?: string;
    kubernetesNamespace?: string;
    kubernetesPod?: string;
    kubernetesNode?: string;
  };
}

export interface SystemInfo {
  platform: string;
  platformName: string;
  defaultShell: string;
  pathSeparator: string;
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
  docker: ContainerInfo;
  isDXT: boolean;
  nodeInfo?: {
    version: string;
    path: string;
    npmVersion?: string;
  };
  pythonInfo?: {
    available: boolean;
    command: string;
    version?: string;
  };
  processInfo: {
    pid: number;
    arch: string;
    platform: string;
    versions: NodeJS.ProcessVersions;
  };
  examplePaths: {
    home: string;
    temp: string;
    absolute: string;
    accessible?: string[];
  };
}

/**
 * Detect container environment and type
 */
function detectContainerEnvironment(): { isContainer: boolean; containerType: ContainerInfo["containerType"]; orchestrator: ContainerInfo["orchestrator"] } {
  // Method 1: Check environment variables first (most reliable when set)

  // Docker-specific
  if (process.env.MCP_CLIENT_DOCKER === "true") {
    return { isContainer: true, containerType: "docker", orchestrator: null };
  }

  // Kubernetes detection
  if (process.env.KUBERNETES_SERVICE_HOST || process.env.KUBERNETES_PORT) {
    return { isContainer: true, containerType: "kubernetes", orchestrator: "kubernetes" };
  }

  // Podman detection
  if (process.env.PODMAN_CONTAINER || process.env.CONTAINER_HOST?.includes("podman")) {
    return { isContainer: true, containerType: "podman", orchestrator: null };
  }

  // Method 2: Check for container indicator files
  if (fs.existsSync("/.dockerenv")) {
    return { isContainer: true, containerType: "docker", orchestrator: null };
  }

  // Method 3: Check /proc/1/cgroup for container indicators (Linux only)
  if (os.platform() === "linux") {
    try {
      const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");

      // Docker detection
      if (cgroup.includes("docker")) {
        return { isContainer: true, containerType: "docker", orchestrator: null };
      }

      // Kubernetes detection (pods run in containerd/cri-o)
      if (cgroup.includes("kubepods") || cgroup.includes("pod")) {
        return { isContainer: true, containerType: "kubernetes", orchestrator: "kubernetes" };
      }

      // Podman detection
      if (cgroup.includes("podman") || cgroup.includes("libpod")) {
        return { isContainer: true, containerType: "podman", orchestrator: null };
      }

      // LXC detection
      if (cgroup.includes("lxc")) {
        return { isContainer: true, containerType: "lxc", orchestrator: null };
      }

      // systemd-nspawn detection
      if (cgroup.includes("machine.slice")) {
        return { isContainer: true, containerType: "systemd-nspawn", orchestrator: null };
      }

      // Generic containerd detection
      if (cgroup.includes("containerd")) {
        return { isContainer: true, containerType: "other", orchestrator: null };
      }
    } catch (_error) {
      // /proc/1/cgroup might not exist
    }
  }

  // Method 4: Check /proc/1/environ for container indicators
  if (os.platform() === "linux") {
    try {
      const environ = fs.readFileSync("/proc/1/environ", "utf8");

      if (environ.includes("container=")) {
        // systemd-nspawn sets container=systemd-nspawn
        if (environ.includes("container=systemd-nspawn")) {
          return { isContainer: true, containerType: "systemd-nspawn", orchestrator: null };
        }

        // LXC sets container=lxc
        if (environ.includes("container=lxc")) {
          return { isContainer: true, containerType: "lxc", orchestrator: null };
        }

        // Generic container detection
        return { isContainer: true, containerType: "other", orchestrator: null };
      }
    } catch (_error) {
      // /proc/1/environ might not exist or be accessible
    }
  }

  // Method 5: Check hostname for Kubernetes patterns
  try {
    const hostname = os.hostname();
    // Kubernetes pods often have hostnames like: podname-deploymentid-randomid
    // Additional check for Kubernetes service account
    if (hostname?.includes("-") && hostname.split("-").length >= 3 && fs.existsSync("/var/run/secrets/kubernetes.io")) {
      return { isContainer: true, containerType: "kubernetes", orchestrator: "kubernetes" };
    }
  } catch (_error) {
    // Hostname check failed
  }

  // Method 6: Check for orchestrator-specific indicators

  // Docker Compose detection
  if (process.env.COMPOSE_PROJECT_NAME || process.env.COMPOSE_SERVICE) {
    return { isContainer: true, containerType: "docker", orchestrator: "docker-compose" };
  }

  // Docker Swarm detection
  if (process.env.DOCKER_SWARM_MODE || process.env.DOCKER_NODE_ID) {
    return { isContainer: true, containerType: "docker", orchestrator: "docker-swarm" };
  }

  return { isContainer: false, containerType: null, orchestrator: null };
}

/**
 * Discover container mount points
 */
function discoverContainerMounts(isContainer: boolean): DockerMount[] {
  const mounts: DockerMount[] = [];

  if (!isContainer) {
    return mounts;
  }

  // Method 1: Parse /proc/mounts (Linux only)
  if (os.platform() === "linux") {
    try {
      const mountsContent = fs.readFileSync("/proc/mounts", "utf8");
      const mountLines = mountsContent.split("\n");

      // System filesystem types that are never user mounts
      const systemFsTypes = new Set([
        "overlay",
        "tmpfs",
        "proc",
        "sysfs",
        "devpts",
        "cgroup",
        "cgroup2",
        "mqueue",
        "debugfs",
        "securityfs",
        "pstore",
        "configfs",
        "fusectl",
        "hugetlbfs",
        "autofs",
        "devtmpfs",
        "bpf",
        "tracefs",
        "shm",
      ]);

      // Filesystem types that indicate host mounts
      const hostMountFsTypes = new Set(["fakeowner", "9p", "virtiofs", "fuse.sshfs"]);

      for (const line of mountLines) {
        const parts = line.split(" ");
        if (parts.length >= 4) {
          const device = parts[0];
          const mountPoint = parts[1];
          const fsType = parts[2];
          const options = parts[3].split(",");

          // Skip system mount points
          const isSystemMountPoint =
            mountPoint === "/" ||
            mountPoint.startsWith("/dev") ||
            mountPoint.startsWith("/sys") ||
            mountPoint.startsWith("/proc") ||
            mountPoint.startsWith("/run") ||
            mountPoint.startsWith("/sbin") ||
            mountPoint === "/etc/resolv.conf" ||
            mountPoint === "/etc/hostname" ||
            mountPoint === "/etc/hosts";

          if (isSystemMountPoint) {
            continue;
          }

          // Detect user mounts by:
          // 1. Known host-mount filesystem types (fakeowner, 9p, virtiofs)
          // 2. Device from /run/host_mark/ (docker-mcp-gateway pattern)
          // 3. Non-system filesystem type with user-like mount point
          const isHostMountFs = hostMountFsTypes.has(fsType);
          const isHostMarkDevice = device.startsWith("/run/host_mark/");
          const isNonSystemFs = !systemFsTypes.has(fsType);
          const isUserLikePath =
            mountPoint.startsWith("/mnt/") ||
            mountPoint.startsWith("/workspace") ||
            mountPoint.startsWith("/data/") ||
            mountPoint.startsWith("/home/") ||
            mountPoint.startsWith("/Users/") ||
            mountPoint.startsWith("/app/") ||
            mountPoint.startsWith("/project/") ||
            mountPoint.startsWith("/src/") ||
            mountPoint.startsWith("/code/");

          if (isHostMountFs || isHostMarkDevice || (isNonSystemFs && isUserLikePath)) {
            const isReadOnly = options.includes("ro");

            mounts.push({
              hostPath: device,
              containerPath: mountPoint,
              type: "bind",
              readOnly: isReadOnly,
              description: `Mounted directory: ${path.basename(mountPoint)}`,
            });
          }
        }
      }
    } catch (_error) {
      // /proc/mounts might not be available
    }
  }

  // Method 2: Check /mnt directory contents
  try {
    if (fs.existsSync("/mnt")) {
      const contents = fs.readdirSync("/mnt");
      for (const item of contents) {
        const itemPath = `/mnt/${item}`;
        try {
          const stats = fs.statSync(itemPath);
          if (stats.isDirectory()) {
            // Check if we already have this mount
            const exists = mounts.some((m) => m.containerPath === itemPath);
            if (!exists) {
              mounts.push({
                hostPath: `<host>/${item}`,
                containerPath: itemPath,
                type: "bind",
                readOnly: false,
                description: `Mounted folder: ${item}`,
              });
            }
          }
        } catch (_itemError) {
          // Skip items we can't stat
        }
      }
    }
  } catch (_error) {
    // /mnt directory doesn't exist or not accessible
  }

  // Method 3: Check /home directory for user-mounted folders (fs-mcp Docker installer pattern)
  try {
    if (fs.existsSync("/home")) {
      const contents = fs.readdirSync("/home");
      for (const item of contents) {
        // Skip the root user directory and common system directories
        if (
          item === "root" ||
          item === "node" ||
          item === "bin" ||
          item === "sbin" ||
          item === "usr" ||
          item === "lib" ||
          item === "lib64" ||
          item === "var" ||
          item === "tmp" ||
          item === "opt" ||
          item === "sys" ||
          item === "proc"
        ) {
          continue;
        }

        const itemPath = `/home/${item}`;
        try {
          const stats = fs.statSync(itemPath);
          if (stats.isDirectory()) {
            // Check if we already have this mount
            const exists = mounts.some((m) => m.containerPath === itemPath);
            if (!exists) {
              mounts.push({
                hostPath: `<host>/${item}`,
                containerPath: itemPath,
                type: "bind",
                readOnly: false,
                description: `Host folder: ${item}`,
              });
            }
          }
        } catch (_itemError) {
          // Skip items we can't stat
        }
      }
    }
  } catch (_error) {
    // /home directory doesn't exist or not accessible
  }

  return mounts;
}

/**
 * Get container environment information
 */
function getContainerEnvironment(containerType: ContainerInfo["containerType"]): ContainerInfo["containerEnvironment"] {
  const env: ContainerInfo["containerEnvironment"] = {};

  // Try to get container name from hostname (often set to container ID/name)
  try {
    const hostname = os.hostname();
    if (hostname && hostname !== "localhost") {
      env.containerName = hostname;
    }
  } catch (_error) {
    // Hostname not available
  }

  // Docker-specific environment
  if (containerType === "docker") {
    // Try multiple sources for Docker image name
    if (process.env.DOCKER_IMAGE) {
      env.dockerImage = process.env.DOCKER_IMAGE;
    } else if (process.env.IMAGE_NAME) {
      env.dockerImage = process.env.IMAGE_NAME;
    } else if (process.env.CONTAINER_IMAGE) {
      env.dockerImage = process.env.CONTAINER_IMAGE;
    }

    // Try to read from Docker labels if available (less common but possible)
    try {
      if (fs.existsSync("/proc/self/cgroup")) {
        const cgroup = fs.readFileSync("/proc/self/cgroup", "utf8");
        // Extract container ID from cgroup path
        const containerIdMatch = cgroup.match(DOCKER_CGROUP_CONTAINER_ID_REGEX);
        if (containerIdMatch && !env.containerName) {
          // Use short container ID as fallback name
          env.containerName = containerIdMatch[1].slice(0, 12);
        }
      }
    } catch (_error) {
      // Ignore errors reading cgroup
    }
  }

  // Kubernetes-specific environment
  if (containerType === "kubernetes") {
    if (process.env.KUBERNETES_NAMESPACE || process.env.POD_NAMESPACE) {
      env.kubernetesNamespace = process.env.KUBERNETES_NAMESPACE || process.env.POD_NAMESPACE;
    }

    if (process.env.POD_NAME || process.env.HOSTNAME) {
      env.kubernetesPod = process.env.POD_NAME || process.env.HOSTNAME;
    }

    if (process.env.NODE_NAME || process.env.KUBERNETES_NODE_NAME) {
      env.kubernetesNode = process.env.NODE_NAME || process.env.KUBERNETES_NODE_NAME;
    }

    // Try to get container image from common Kubernetes environment variables
    if (process.env.CONTAINER_IMAGE) {
      env.dockerImage = process.env.CONTAINER_IMAGE;
    } else if (process.env.IMAGE_NAME) {
      env.dockerImage = process.env.IMAGE_NAME;
    }

    // Try to read Kubernetes service account info
    try {
      if (fs.existsSync("/var/run/secrets/kubernetes.io/serviceaccount/namespace")) {
        const namespace = fs.readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/namespace", "utf8").trim();
        if (namespace && !env.kubernetesNamespace) {
          env.kubernetesNamespace = namespace;
        }
      }
    } catch (_error) {
      // Service account info not available
    }
  }

  // Podman-specific environment
  // Podman uses similar environment variables to Docker
  if (containerType === "podman" && (process.env.CONTAINER_IMAGE || process.env.PODMAN_IMAGE)) {
    env.dockerImage = process.env.CONTAINER_IMAGE || process.env.PODMAN_IMAGE;
  }

  // LXC-specific environment
  // LXC containers might have different naming conventions
  if (containerType === "lxc" && process.env.LXC_NAME) {
    env.containerName = process.env.LXC_NAME;
  }

  // Try to detect host platform
  if (process.env.HOST_PLATFORM) {
    env.hostPlatform = process.env.HOST_PLATFORM;
  }

  return Object.keys(env).length > 0 ? env : undefined;
}

/**
 * Detect Node.js installation and version from current process
 */
function detectNodeInfo(): SystemInfo["nodeInfo"] {
  try {
    // Get Node.js version from current process
    const version = process.version.replace("v", ""); // Remove 'v' prefix

    // Get Node.js executable path from current process
    const path = process.execPath;

    // Get npm version from environment if available
    const npmVersion = process.env.npm_version;

    return {
      version,
      path,
      ...(npmVersion && { npmVersion }),
    };
  } catch (_error) {
    return;
  }
}

/**
 * Detect Python installation and version and put on systeminfo.pythonInfo
 */
function detectPythonInfo(): SystemInfo["pythonInfo"] {
  // Try python commands in order of preference
  const pythonCommands =
    process.platform === "win32"
      ? ["python", "python3", "py"] // Windows: 'python' is common, 'py' launcher
      : ["python3", "python"]; // Unix: prefer python3

  for (const cmd of pythonCommands) {
    try {
      const version = execSync(`${cmd} --version`, {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      // Verify it's Python 3.x
      if (version.includes("Python 3")) {
        return {
          available: true,
          command: cmd,
          version: version.replace("Python ", ""),
        };
      }
    } catch {
      // Command not found or failed, try next
    }
  }

  return { available: false, command: "" };
}

/**
 * Get comprehensive system information for tool prompts
 */
export function getSystemInfo(): SystemInfo {
  const platform = os.platform();
  const isWindows = platform === "win32";
  const isMacOS = platform === "darwin";
  const isLinux = platform === "linux";

  // Container detection
  const containerDetection = detectContainerEnvironment();
  const mountPoints = containerDetection.isContainer ? discoverContainerMounts(containerDetection.isContainer) : [];

  let platformName: string;
  let defaultShell: string;
  let pathSeparator: string;
  let examplePaths: SystemInfo["examplePaths"];

  if (isWindows) {
    platformName = "Windows";
    defaultShell = "pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command";
    pathSeparator = "\\";
    examplePaths = {
      home: "C:\\Users\\username",
      temp: "C:\\Temp",
      absolute: "C:\\path\\to\\file.txt",
    };
  } else if (isMacOS) {
    platformName = "macOS";
    defaultShell = "zsh";
    pathSeparator = "/";
    examplePaths = {
      home: "/Users/username",
      temp: "/tmp",
      absolute: "/path/to/file.txt",
    };
  } else if (isLinux) {
    platformName = "Linux";
    defaultShell = "bash";
    pathSeparator = "/";
    examplePaths = {
      home: "/home/username",
      temp: "/tmp",
      absolute: "/path/to/file.txt",
    };
  } else {
    // Fallback for other Unix-like systems
    platformName = "Unix";
    defaultShell = "bash";
    pathSeparator = "/";
    examplePaths = {
      home: "/home/username",
      temp: "/tmp",
      absolute: "/path/to/file.txt",
    };
  }

  // Adjust platform name for containers
  if (containerDetection.isContainer) {
    let containerLabel = "";

    if (containerDetection.containerType === "kubernetes") {
      containerLabel = "Kubernetes";
      if (containerDetection.orchestrator === "kubernetes") {
        containerLabel += " Pod";
      }
    } else if (containerDetection.containerType === "docker") {
      containerLabel = "Docker";
      if (containerDetection.orchestrator === "docker-compose") {
        containerLabel += " Compose";
      } else if (containerDetection.orchestrator === "docker-swarm") {
        containerLabel += " Swarm";
      }
    } else if (containerDetection.containerType === "podman") {
      containerLabel = "Podman";
    } else if (containerDetection.containerType === "lxc") {
      containerLabel = "LXC";
    } else if (containerDetection.containerType === "systemd-nspawn") {
      containerLabel = "systemd-nspawn";
    } else {
      containerLabel = "Container";
    }

    platformName = `${platformName} (${containerLabel})`;

    // Add accessible paths from mounts
    if (mountPoints.length > 0) {
      examplePaths.accessible = mountPoints.map((mount) => mount.containerPath);
    }
  }

  // Detect Node.js installation from current process
  const nodeInfo = detectNodeInfo();

  // Detect Python installation
  const pythonInfo = detectPythonInfo();

  // Get process information
  const processInfo = {
    pid: process.pid,
    arch: process.arch,
    platform: process.platform,
    versions: process.versions,
  };

  return {
    platform,
    platformName,
    defaultShell,
    pathSeparator,
    isWindows,
    isMacOS,
    isLinux,
    docker: {
      // New container detection fields
      isContainer: containerDetection.isContainer,
      containerType: containerDetection.containerType,
      orchestrator: containerDetection.orchestrator,
      // Backward compatibility - keep old field
      isDocker: containerDetection.isContainer && containerDetection.containerType === "docker",
      mountPoints,
      containerEnvironment: getContainerEnvironment(containerDetection.containerType),
    },
    isDXT: !!process.env.MCP_DXT,
    nodeInfo,
    pythonInfo,
    processInfo,
    examplePaths,
  };
}

/**
 * Generate OS-specific guidance for tool prompts
 */

export {getDevelopmentToolGuidance, getOSSpecificGuidance, getPathGuidance} from "@app/runtime/runtime-guidance";

