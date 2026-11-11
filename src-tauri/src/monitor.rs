//! Server monitor for the admin panel: how the TV laptop is doing, its
//! Docker containers, services and Tailscale. Read-only, except for starting,
//! stopping and restarting containers.
use serde_json::{json, Value};
use std::fs;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

fn read(p: &str) -> String {
    fs::read_to_string(p).unwrap_or_default()
}

/// Runs a command with a time limit; stdout on success.
fn run(bin: &str, args: &[&str], secs: u64) -> Option<String> {
    let mut child = Command::new(bin).args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() > Duration::from_secs(secs) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => return None,
        }
    }
    let out = child.wait_with_output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

fn cpu_times() -> Vec<(u64, u64)> {
    read("/proc/stat")
        .lines()
        .filter(|l| l.starts_with("cpu"))
        .map(|l| {
            let v: Vec<u64> = l.split_whitespace().skip(1).filter_map(|x| x.parse().ok()).collect();
            let idle = v.get(3).copied().unwrap_or(0) + v.get(4).copied().unwrap_or(0);
            (v.iter().sum(), idle)
        })
        .collect()
}

fn net_bytes() -> Vec<(String, u64, u64)> {
    read("/proc/net/dev")
        .lines()
        .skip(2)
        .filter_map(|l| {
            let (name, rest) = l.split_once(':')?;
            let name = name.trim().to_string();
            if name == "lo" || name.starts_with("veth") || name.starts_with("br-") || name.starts_with("docker") {
                return None;
            }
            let v: Vec<u64> = rest.split_whitespace().filter_map(|x| x.parse().ok()).collect();
            Some((name, *v.first()?, *v.get(8)?))
        })
        .collect()
}

fn kb(line: &str) -> u64 {
    line.split_whitespace().nth(1).and_then(|v| v.parse().ok()).unwrap_or(0) * 1024
}

pub fn snapshot() -> Value {
    // CPU and network: two samples half a second apart.
    let (c1, n1) = (cpu_times(), net_bytes());
    thread::sleep(Duration::from_millis(500));
    let (c2, n2) = (cpu_times(), net_bytes());
    let pct = |a: &(u64, u64), b: &(u64, u64)| {
        let (dt, di) = (b.0.saturating_sub(a.0), b.1.saturating_sub(a.1));
        if dt == 0 { 0.0 } else { ((dt - di.min(dt)) as f64 * 100.0 / dt as f64 * 10.0).round() / 10.0 }
    };
    let cores: Vec<f64> = c1.iter().zip(c2.iter()).skip(1).map(|(a, b)| pct(a, b)).collect();
    let cpu = c1.first().zip(c2.first()).map(|(a, b)| pct(a, b)).unwrap_or(0.0);
    let net: Vec<Value> = n2
        .iter()
        .filter_map(|(name, rx, tx)| {
            if rx + tx == 0 {
                return None; // unused interfaces
            }
            let (_, rx0, tx0) = n1.iter().find(|(n, _, _)| n == name)?;
            Some(json!({ "name": name, "rx": (rx.saturating_sub(*rx0)) * 2, "tx": (tx.saturating_sub(*tx0)) * 2, "rxTotal": rx, "txTotal": tx }))
        })
        .collect();

    let mem = read("/proc/meminfo");
    let field = |k: &str| mem.lines().find(|l| l.starts_with(k)).map(kb).unwrap_or(0);
    let (total, avail) = (field("MemTotal:"), field("MemAvailable:"));
    let (swap_total, swap_free) = (field("SwapTotal:"), field("SwapFree:"));

    let load: Vec<f64> = read("/proc/loadavg").split_whitespace().take(3).filter_map(|v| v.parse().ok()).collect();
    let uptime = read("/proc/uptime").split_whitespace().next().and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
    let model = read("/proc/cpuinfo").lines().find(|l| l.starts_with("model name")).and_then(|l| l.split_once(':')).map(|x| x.1.trim().to_string()).unwrap_or_default();

    // Disks (real file systems only).
    let disks: Vec<Value> = run("df", &["-B1", "--output=target,size,used,avail,fstype", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs", "-x", "overlay", "-x", "efivarfs"], 4)
        .unwrap_or_default()
        .lines()
        .skip(1)
        .filter_map(|l| {
            let v: Vec<&str> = l.split_whitespace().collect();
            if v.len() < 5 || v[0].starts_with("/boot") || v[0].starts_with("/snap") {
                return None;
            }
            Some(json!({ "mount": v[0], "size": v[1].parse::<u64>().ok()?, "used": v[2].parse::<u64>().ok()?, "free": v[3].parse::<u64>().ok()?, "fs": v[4] }))
        })
        .collect();

    // Temperatures: hwmon sensors with their names.
    let mut temps = Vec::new();
    if let Ok(rd) = fs::read_dir("/sys/class/hwmon") {
        for e in rd.flatten() {
            let p = e.path();
            let chip = read(&format!("{}/name", p.display())).trim().to_string();
            for i in 1..=8 {
                let v = read(&format!("{}/temp{i}_input", p.display()));
                let Ok(milli) = v.trim().parse::<f64>() else { continue };
                let label = read(&format!("{}/temp{i}_label", p.display())).trim().to_string();
                temps.push(json!({ "name": if label.is_empty() { chip.clone() } else { format!("{chip} {label}") }, "c": (milli / 100.0).round() / 10.0 }));
            }
        }
    }

    // Busiest processes.
    let procs: Vec<Value> = run("ps", &["-eo", "pid,pcpu,pmem,comm", "--sort=-pcpu", "--no-headers"], 4)
        .unwrap_or_default()
        .lines()
        .take(8)
        .filter_map(|l| {
            let v: Vec<&str> = l.split_whitespace().collect();
            Some(json!({ "pid": v.first()?.parse::<u32>().ok()?, "cpu": v.get(1)?.parse::<f64>().ok()?, "mem": v.get(2)?.parse::<f64>().ok()?, "name": v[3..].join(" ") }))
        })
        .collect();

    json!({
        "host": read("/etc/hostname").trim(),
        "model": model,
        "uptime": uptime,
        "load": load,
        "cpu": cpu,
        "cores": cores,
        "memory": { "total": total, "used": total.saturating_sub(avail), "available": avail },
        "swap": { "total": swap_total, "used": swap_total.saturating_sub(swap_free) },
        "disks": disks,
        "net": net,
        "temps": temps,
        "processes": procs,
        "docker": docker(),
        "services": services(),
        "tailscale": tailscale(),
    })
}

fn docker() -> Value {
    let Some(out) = run("docker", &["ps", "-a", "--format", "{{json .}}"], 6) else {
        let installed = Command::new("docker").arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok();
        return json!({ "available": false, "reason": if installed { "YousufOS can't talk to Docker (add your user to the docker group: sudo usermod -aG docker $USER, then log out and in)" } else { "Docker isn't installed" } });
    };
    let list: Vec<Value> = out
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .map(|c| json!({ "name": c["Names"], "image": c["Image"], "state": c["State"], "status": c["Status"], "ports": c["Ports"] }))
        .collect();
    json!({ "available": true, "containers": list })
}

fn services() -> Vec<Value> {
    ["ssh", "docker", "tailscaled", "jellyfin", "home-assistant", "smbd", "NetworkManager"]
        .iter()
        .filter_map(|s| {
            // is-active prints active / inactive / failed (and exits non-zero unless active).
            let state = Command::new("systemctl").args(["is-active", s]).output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
            // Units that don't exist on this machine aren't listed.
            let exists = Command::new("systemctl")
                .args(["cat", s])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|st| st.success())
                .unwrap_or(false);
            exists.then(|| json!({ "name": s, "state": state }))
        })
        .collect()
}

fn tailscale() -> Value {
    let Some(out) = run("tailscale", &["status", "--json"], 5) else { return json!({ "available": false }) };
    let Ok(v) = serde_json::from_str::<Value>(&out) else { return json!({ "available": false }) };
    let peers = v["Peer"].as_object().map(|m| m.values().collect::<Vec<_>>()).unwrap_or_default();
    json!({
        "available": true,
        "state": v["BackendState"],
        "name": v["Self"]["HostName"],
        "ips": v["Self"]["TailscaleIPs"],
        "online": v["Self"]["Online"],
        "peers": peers.iter().map(|p| json!({ "name": p["HostName"], "online": p["Online"], "os": p["OS"] })).collect::<Vec<_>>(),
    })
}

/// docker start / stop / restart <container>
pub fn docker_action(name: &str, action: &str) -> Result<Value, String> {
    if !matches!(action, "start" | "stop" | "restart") {
        return Err("unknown action".into());
    }
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)) {
        return Err("bad container name".into());
    }
    let out = Command::new("docker").args([action, name]).output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(json!({ "ok": true }))
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}
