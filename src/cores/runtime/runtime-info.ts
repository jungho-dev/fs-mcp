/**
 * @file src/cores/runtime/runtime-info.ts
 * @description Runtime environment information.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DCCIR = /docker\/([a-f0-9]{64})/;

export declare interface DockerMount {
  containerPath: string;
  description: string;
  hostPath: string;
  readOnly: boolean;
  type: "bind" | "volume";
}

export declare interface ContainerInfo {
  containerEnvironment?: {
    dockerImage?: string;
    containerName?: string;
    hostPlatform?: string;
    kubernetesNamespace?: string;
    kubernetesPod?: string;
    kubernetesNode?: string;
  };
  containerType: "docker" | "podman" | "kubernetes" | "lxc" | "systemd-nspawn" | "other" | null;
  // New enhanced detection
  isContainer: boolean;
  // Backward compatibility
  isDocker: boolean;
  mountPoints: DockerMount[];
  orchestrator: "kubernetes" | "docker-compose" | "docker-swarm" | "podman-compose" | null;
}

export declare interface SystemInfo {
  defaultShell: string;
  docker: ContainerInfo;
  examplePaths: {
    home: string;
    temp: string;
    absolute: string;
    accessible?: string[];
  };
  isDXT: boolean;
  isLinux: boolean;
  isMacOS: boolean;
  isWindows: boolean;
  nodeInfo?: {
    version: string;
    path: string;
    npmVersion?: string;
  };
  pathSeparator: string;
  platform: string;
  platformName: string;
  processInfo: {
    pid: number;
    arch: string;
    platform: string;
    versions: NodeJS.ProcessVersions;
  };
  pythonInfo?: {
    available: boolean;
    command: string;
    version?: string;
  };
}

// 1. Detect container environment -----------------------------------------------------------------
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
    }
    catch (_error) {
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
    }
    catch (_error) {
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
  }
  catch (_error) {
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

// 2. Discover container mounts --------------------------------------------------------------------
function discoverContainerMounts(isContainer: boolean): DockerMount[] {
  const mounts: DockerMount[] = [];

  if (!isContainer) {
    return mounts;
  }

  // Method 1: Parse /proc/mounts (Linux only)
  if (os.platform() === "linux") {
    try {
      const mntsCont = fs.readFileSync("/proc/mounts", "utf8");
      const mountLines = mntsCont.split("\n");

      // System filesystem types that are never user mounts
      const systFsTyps = new Set([
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
      const hstMntFsTyps = new Set(["fakeowner", "9p", "virtiofs", "fuse.sshfs"]);

      for (const line of mountLines) {
        const parts = line.split(" ");
        if (parts.length >= 4) {
          const device = parts[0];
          const mountPoint = parts[1];
          const fsType = parts[2];
          const options = parts[3].split(",");

          // Skip system mount points
          const isSystMntPnt =
            mountPoint === "/" ||
            mountPoint.startsWith("/dev") ||
            mountPoint.startsWith("/sys") ||
            mountPoint.startsWith("/proc") ||
            mountPoint.startsWith("/run") ||
            mountPoint.startsWith("/sbin") ||
            mountPoint === "/etc/resolv.conf" ||
            mountPoint === "/etc/hostname" ||
            mountPoint === "/etc/hosts";

          if (isSystMntPnt) {
            continue;
          }

          // Detect user mounts by:
          // 1. Known host-mount filesystem types (fakeowner, 9p, virtiofs)
          // 2. Device from /run/host_mark/ (docker-mcp-gateway pattern)
          // 3. Non-system filesystem type with user-like mount point
          const isHstMntFs = hstMntFsTyps.has(fsType);
          const isHstMrkDvc = device.startsWith("/run/host_mark/");
          const isNnSystFs = !systFsTyps.has(fsType);
          const isUsrLkPth =
            mountPoint.startsWith("/mnt/") ||
            mountPoint.startsWith("/workspace") ||
            mountPoint.startsWith("/data/") ||
            mountPoint.startsWith("/home/") ||
            mountPoint.startsWith("/Users/") ||
            mountPoint.startsWith("/app/") ||
            mountPoint.startsWith("/project/") ||
            mountPoint.startsWith("/src/") ||
            mountPoint.startsWith("/code/");

          if (isHstMntFs || isHstMrkDvc || (isNnSystFs && isUsrLkPth)) {
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
    }
    catch (_error) {
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
        }
        catch (_itemError) {
          // Skip items we can't stat
        }
      }
    }
  }
  catch (_error) {
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
        }
        catch (_itemError) {
          // Skip items we can't stat
        }
      }
    }
  }
  catch (_error) {
    // /home directory doesn't exist or not accessible
  }

  return mounts;
}

// 3. Get container environment --------------------------------------------------------------------
function getContainerEnvironment(cntnTyp: ContainerInfo["containerType"]): ContainerInfo["containerEnvironment"] {
  const env: ContainerInfo["containerEnvironment"] = {};

  // Try to get container name from hostname (often set to container ID/name)
  try {
    const hostname = os.hostname();
    if (hostname && hostname !== "localhost") {
      env.containerName = hostname;
    }
  }
  catch (_error) {
    // Hostname not available
  }

  // Docker-specific environment
  if (cntnTyp === "docker") {
    // Try multiple sources for Docker image name
    if (process.env.DOCKER_IMAGE) {
      env.dockerImage = process.env.DOCKER_IMAGE;
    }
    else if (process.env.IMAGE_NAME) {
      env.dockerImage = process.env.IMAGE_NAME;
    }
    else if (process.env.CONTAINER_IMAGE) {
      env.dockerImage = process.env.CONTAINER_IMAGE;
    }

    // Try to read from Docker labels if available (less common but possible)
    try {
      if (fs.existsSync("/proc/self/cgroup")) {
        const cgroup = fs.readFileSync("/proc/self/cgroup", "utf8");
        // Extract container ID from cgroup path
        const cntnIdMtch = cgroup.match(DCCIR);
        if (cntnIdMtch && !env.containerName) {
          // Use short container ID as fallback name
          env.containerName = cntnIdMtch[1].slice(0, 12);
        }
      }
    }
    catch (_error) {
      // Ignore errors reading cgroup
    }
  }

  // Kubernetes-specific environment
  if (cntnTyp === "kubernetes") {
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
    }
    else if (process.env.IMAGE_NAME) {
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
    }
    catch (_error) {
      // Service account info not available
    }
  }

  // Podman-specific environment
  // Podman uses similar environment variables to Docker
  if (cntnTyp === "podman" && (process.env.CONTAINER_IMAGE || process.env.PODMAN_IMAGE)) {
    env.dockerImage = process.env.CONTAINER_IMAGE || process.env.PODMAN_IMAGE;
  }

  // LXC-specific environment
  // LXC containers might have different naming conventions
  if (cntnTyp === "lxc" && process.env.LXC_NAME) {
    env.containerName = process.env.LXC_NAME;
  }

  // Try to detect host platform
  if (process.env.HOST_PLATFORM) {
    env.hostPlatform = process.env.HOST_PLATFORM;
  }

  return Object.keys(env).length > 0 ? env : undefined;
}

// 4. Detect node info -----------------------------------------------------------------------------
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
  }
  catch (_error) {
    return;
  }
}

// 5. Detect python info ---------------------------------------------------------------------------
function detectPythonInfo(): SystemInfo["pythonInfo"] {
  // Try python commands in order of preference
  const pythCmds =
    process.platform === "win32"
      ? ["python", "python3", "py"] // Windows: 'python' is common, 'py' launcher
      : ["python3", "python"]; // Unix: prefer python3

  for (const cmd of pythCmds) {
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
    }
    catch {
      // Command not found or failed, try next
    }
  }

  return { available: false, command: "" };
}

// 6. Get system info ------------------------------------------------------------------------------
export function getSystemInfo(): SystemInfo {
  const platform = os.platform();
  const isWindows = platform === "win32";
  const isMacOS = platform === "darwin";
  const isLinux = platform === "linux";

  // Container detection
  const cntnDtct = detectContainerEnvironment();
  const mountPoints = cntnDtct.isContainer ? discoverContainerMounts(cntnDtct.isContainer) : [];
  const homeDir = os.homedir();
  const tempDir = os.tmpdir();

  let platformName: string;
  let defaultShell: string;
  let pthSprt: string;
  let examplePaths: SystemInfo["examplePaths"];

  if (isWindows) {
    platformName = "Windows";
    defaultShell = "pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command";
    pthSprt = "\\";
    examplePaths = {
      home: homeDir,
      temp: tempDir,
      absolute: path.join(homeDir, "path", "to", "file.txt"),
    };
  }
  else if (isMacOS) {
    platformName = "macOS";
    defaultShell = "zsh";
    pthSprt = "/";
    examplePaths = {
      home: homeDir,
      temp: tempDir,
      absolute: path.join(homeDir, "path", "to", "file.txt"),
    };
  }
  else if (isLinux) {
    platformName = "Linux";
    defaultShell = "bash";
    pthSprt = "/";
    examplePaths = {
      home: homeDir,
      temp: tempDir,
      absolute: path.join(homeDir, "path", "to", "file.txt"),
    };
  }
  else {
    // Fallback for other Unix-like systems
    platformName = "Unix";
    defaultShell = "bash";
    pthSprt = "/";
    examplePaths = {
      home: homeDir,
      temp: tempDir,
      absolute: path.join(homeDir, "path", "to", "file.txt"),
    };
  }

  // Adjust platform name for containers
  if (cntnDtct.isContainer) {
    let cntnLbl = "";

    if (cntnDtct.containerType === "kubernetes") {
      cntnLbl = "Kubernetes";
      if (cntnDtct.orchestrator === "kubernetes") {
        cntnLbl += " Pod";
      }
    }
    else if (cntnDtct.containerType === "docker") {
      cntnLbl = "Docker";
      if (cntnDtct.orchestrator === "docker-compose") {
        cntnLbl += " Compose";
      }
      else if (cntnDtct.orchestrator === "docker-swarm") {
        cntnLbl += " Swarm";
      }
    }
    else if (cntnDtct.containerType === "podman") {
      cntnLbl = "Podman";
    }
    else if (cntnDtct.containerType === "lxc") {
      cntnLbl = "LXC";
    }
    else if (cntnDtct.containerType === "systemd-nspawn") {
      cntnLbl = "systemd-nspawn";
    }
    else {
      cntnLbl = "Container";
    }

    platformName = `${platformName} (${cntnLbl})`;

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
    pathSeparator: pthSprt,
    isWindows,
    isMacOS,
    isLinux,
    docker: {
      // New container detection fields
      isContainer: cntnDtct.isContainer,
      containerType: cntnDtct.containerType,
      orchestrator: cntnDtct.orchestrator,
      // Backward compatibility - keep old field
      isDocker: cntnDtct.isContainer && cntnDtct.containerType === "docker",
      mountPoints,
      containerEnvironment: getContainerEnvironment(cntnDtct.containerType),
    },
    isDXT: !!process.env.MCP_DXT,
    nodeInfo,
    pythonInfo,
    processInfo,
    examplePaths,
  };
}
