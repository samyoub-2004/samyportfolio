"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FsNode =
  | { type: "dir"; children: Record<string, FsNode> }
  | { type: "file"; content: string };

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCommandLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] ?? "";
    if (ch === "\\" && i + 1 < line.length) {
      cur += line[i + 1];
      i += 1;
      continue;
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (cur.length > 0) {
        out.push(cur);
        cur = "";
      }
      continue;
    }

    cur += ch;
  }

  if (cur.length > 0) out.push(cur);
  return out;
}

function normalizePath(parts: string[]) {
  const stack: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") {
      stack.pop();
      continue;
    }
    stack.push(p);
  }
  return stack;
}

function pathToString(parts: string[]) {
  return "/" + parts.join("/");
}

function resolvePath(cwd: string[], target: string) {
  if (!target || target === "~") return [];
  if (target.startsWith("/")) return normalizePath(target.split("/").filter(Boolean));
  if (target.startsWith("~")) {
    const rest = target.slice(1);
    const rel = rest.startsWith("/") ? rest.slice(1) : rest;
    return normalizePath(rel ? rel.split("/") : []);
  }
  return normalizePath(cwd.concat(target.split("/").filter(Boolean)));
}

function getNode(root: FsNode, pathParts: string[]) {
  let node: FsNode = root;
  for (const part of pathParts) {
    if (node.type !== "dir") return undefined;
    const next = node.children[part];
    if (!next) return undefined;
    node = next;
  }
  return node;
}

function listDir(root: FsNode, pathParts: string[]) {
  const node = getNode(root, pathParts);
  if (!node) return { ok: false as const, error: "Aucun fichier ou dossier" };
  if (node.type !== "dir") return { ok: false as const, error: "N'est pas un dossier" };
  const names = Object.keys(node.children);
  names.sort((a, b) => a.localeCompare(b));
  return { ok: true as const, names };
}

function formatLs(root: FsNode, pathParts: string[]) {
  const res = listDir(root, pathParts);
  if (!res.ok) return `ls: ${res.error}`;

  const pieces = res.names.map((name) => {
    const node = (getNode(root, pathParts.concat(name)) ?? { type: "file" }) as FsNode;
    if (node.type === "dir") return `<span style=\"color:var(--cyan)\">${escapeHtml(name)}/</span>`;
    return escapeHtml(name);
  });
  return pieces.join("  ");
}

function formatPromptPath(cwd: string[]) {
  if (cwd.length === 0) return "~";
  return "~/" + cwd.join("/");
}

const fsRoot: FsNode = {
  type: "dir",
  children: {
    Bureau: {
      type: "dir",
      children: {
        "note_importante.txt": {
          type: "file",
          content:
            "Rappel: boire de l'eau.\\nRappel 2: ne jamais faire confiance à un bouton rouge.\\n",
        },
        "todo.txt": {
          type: "file",
          content: "- Devenir riche\\n- Faire semblant de bosser\\n- Recommencer\\n",
        },
      },
    },
    Telechargements: {
      type: "dir",
      children: {
        "RAM_16GB.zip": {
          type: "file",
          content:
            "Archive corrompue.\\nCause: la RAM ne se télécharge pas, chef.\\n",
        },
        "internet.exe": {
          type: "file",
          content: "Erreur: Internet a cessé de fonctionner.\\n",
        },
      },
    },
    Projets_Top_Secret: {
      type: "dir",
      children: {
        "roadmap.md": {
          type: "file",
          content:
            "1) Build\\n2) Ship\\n3) Corriger un bug en prod à 3h du matin\\n4) Disappear\\n",
        },
        "plan_de_domination_du_monde.txt": {
          type: "file",
          content:
            "Étape 1: apprendre CSS\\nÉtape 2: centrer une div\\nÉtape 3: trop dur, abandon\\n",
        },
        "samy_driver.sys": {
          type: "file",
          content: "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED\n",
        },
      },
    },
    "virus.exe": {
      type: "file",
      content:
        "Permission denied\nAstuce: essaye plutôt 'help' au lieu d'ouvrir des .exe bizarres.\n",
    },
  },
};

export default function Home() {
  const [cmd, setCmd] = useState("");
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "[INITIALISATION TERMINAL RÉUSSIE]",
    "Bienvenue, invité. Tapez <span style=\"color:white\">'help'</span> pour la liste des commandes.",
    "<br>",
  ]);

  const [cwd, setCwd] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const [matrixActive, setMatrixActive] = useState(false);
  const [glitchVisible, setGlitchVisible] = useState(false);
  const [crashTimer, setCrashTimer] = useState(5);

  const [scanText, setScanText] = useState("Status: En attente...");

  const [progressVisible, setProgressVisible] = useState(false);
  const [progressWidth, setProgressWidth] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [downloadDisabled, setDownloadDisabled] = useState(false);

  const terminalRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scanSteps = useMemo(
    () => [
      "Recherche de l'adresse IP...",
      "Localisation : Entre un bureau et une chaise.",
      "Scan rétinien via webcam (Activé)...",
      "Analyse : Humain fatigué détecté.",
      "Conclusion : Besoin de café imminent.",
    ],
    [],
  );

  useEffect(() => {
    if (!terminalRef.current) return;
    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalLines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!matrixActive) {
      document.body.style.filter = "none";
      document.body.style.backgroundColor = "#050505";
      return;
    }

    document.body.style.filter =
      "sepia(1) hue-rotate(100deg) brightness(1.1) contrast(1.2)";
    document.body.style.backgroundColor = "#000500";

    return () => {
      document.body.style.filter = "none";
      document.body.style.backgroundColor = "#050505";
    };
  }, [matrixActive]);

  function runTerminalCommand(rawLine: string) {
    const trimmed = rawLine.trim();
    const prompt = `<span style=\"color:#888\">guest@oubraham:${escapeHtml(
      formatPromptPath(cwd),
    )}$</span> ${escapeHtml(rawLine)}`;

    setTerminalLines((prev) => [...prev, prompt]);

    if (trimmed.length === 0) return;

    const tokens = parseCommandLine(trimmed);
    const bin = (tokens[0] ?? "").toLowerCase();
    const args = tokens.slice(1);

    const push = (html: string) =>
      setTerminalLines((prev) => [...prev, html]);

    if (bin === "clear") {
      setTerminalLines([]);
      return;
    }

    if (bin === "help") {
      push(
        "Commandes disponibles : <span style=\"color:white\">about, skills, ls, cd, pwd, cat, echo, whoami, date, uname, clear, secret, sudo</span>",
      );
      return;
    }

    if (bin === "about") {
      push(
        "Oubraham Samy, 22 ans. Développeur Full-Stack capable de créer des SaaS et des applications mobiles complexes.",
      );
      return;
    }

    if (bin === "skills") {
      push("Stack: Next.js, React Native, Node.js, Supabase, Prisma, Cybersecurity (Pentesting).");
      return;
    }

    if (bin === "secret") {
      push("Le mot de passe du Wi-Fi de Samy est : ****************");
      return;
    }

    if (bin === "sudo") {
      push(
        "Tentative d'escalade de privilèges détectée. Votre adresse IP a été envoyée à la police du web.",
      );
      return;
    }

    if (bin === "pwd") {
      push(escapeHtml(pathToString(cwd)));
      return;
    }

    if (bin === "whoami") {
      push("guest");
      return;
    }

    if (bin === "date") {
      push(escapeHtml(new Date().toString()));
      return;
    }

    if (bin === "uname") {
      const flag = args[0] ?? "";
      if (flag === "-a") {
        push("OubrahamOS kernel 6.6.6 #1 SMP PREEMPT prank-mode");
      } else {
        push("OubrahamOS");
      }
      return;
    }

    if (bin === "ls") {
      const target = args[0] ?? "";
      const path = resolvePath(cwd, target);
      push(formatLs(fsRoot, path));
      return;
    }

    if (bin === "cd") {
      const target = args[0] ?? "~";
      const next = resolvePath(cwd, target);
      const node = getNode(fsRoot, next);
      if (!node) {
        push(`cd: ${escapeHtml(target)}: Aucun fichier ou dossier`);
        return;
      }
      if (node.type !== "dir") {
        push(`cd: ${escapeHtml(target)}: N'est pas un dossier`);
        return;
      }
      setCwd(next);
      return;
    }

    if (bin === "cat") {
      const target = args[0];
      if (!target) {
        push("cat: fichier manquant");
        return;
      }
      const path = resolvePath(cwd, target);
      const node = getNode(fsRoot, path);
      if (!node) {
        push(`cat: ${escapeHtml(target)}: Aucun fichier ou dossier`);
        return;
      }
      if (node.type !== "file") {
        push(`cat: ${escapeHtml(target)}: Est un dossier`);
        return;
      }
      push(escapeHtml(node.content).replaceAll("\n", "<br>"));
      return;
    }

    if (bin === "echo") {
      const text = args.join(" ");
      push(escapeHtml(text));
      return;
    }

    push(`bash: ${escapeHtml(bin)}: commande introuvable`);
  }

  function onEnterCommand() {
    const raw = cmd;
    setHistoryIndex(null);
    if (raw.trim().length > 0) {
      setHistory((prev) => {
        const next = prev.length > 0 && prev[prev.length - 1] === raw ? prev : prev.concat(raw);
        return next.slice(-200);
      });
    }
    setCmd("");
    runTerminalCommand(raw);
  }

  function autoComplete() {
    const raw = cmd;
    const leftTrim = raw.replace(/^\s+/, "");
    const tokens = parseCommandLine(leftTrim);
    if (tokens.length === 0) return;

    const isFirst = tokens.length === 1 && !/\s$/.test(leftTrim);
    const current = tokens[tokens.length - 1] ?? "";

    if (isFirst) {
      const bins = [
        "help",
        "about",
        "skills",
        "ls",
        "cd",
        "pwd",
        "cat",
        "echo",
        "whoami",
        "date",
        "uname",
        "clear",
        "secret",
        "sudo",
      ];
      const matches = bins.filter((b) => b.startsWith(current.toLowerCase()));
      if (matches.length === 1) {
        setCmd(matches[0] + " ");
      } else if (matches.length > 1) {
        setTerminalLines((prev) => [...prev, matches.map(escapeHtml).join("  ")]);
      }
      return;
    }

    const bin = (tokens[0] ?? "").toLowerCase();
    if (!["cd", "cat", "ls"].includes(bin)) return;

    const prefix = current;
    const baseParts = prefix.includes("/")
      ? resolvePath(cwd, prefix.split("/").slice(0, -1).join("/") || ".")
      : cwd;
    const lastPart = prefix.includes("/") ? prefix.split("/").slice(-1)[0] ?? "" : prefix;

    const res = listDir(fsRoot, baseParts);
    if (!res.ok) return;
    const matches = res.names.filter((n) => n.toLowerCase().startsWith(lastPart.toLowerCase()));
    if (matches.length === 1) {
      const name = matches[0] ?? "";
      const node = getNode(fsRoot, baseParts.concat(name));
      const suffix = node?.type === "dir" ? "/" : " ";
      const completed = prefix.includes("/")
        ? prefix.split("/").slice(0, -1).concat(name).join("/")
        : name;

      const rebuilt = tokens
        .slice(0, -1)
        .concat([completed + suffix])
        .join(" ");
      setCmd(rebuilt);
    } else if (matches.length > 1) {
      setTerminalLines((prev) => [...prev, matches.map(escapeHtml).join("  ")]);
    }
  }

  function triggerCrash() {
    setGlitchVisible(true);
    setCrashTimer(5);

    let count = 5;
    const interval = window.setInterval(() => {
      count -= 1;
      setCrashTimer(count);
      if (count <= 0) {
        window.clearInterval(interval);
        setGlitchVisible(false);
      }
    }, 1000);
  }

  function startScan() {
    let i = 0;
    setScanText(scanSteps[0] ?? "");
    const interval = window.setInterval(() => {
      const next = scanSteps[i];
      if (next !== undefined) setScanText(next);
      i += 1;
      if (i >= scanSteps.length) window.clearInterval(interval);
    }, 1200);
  }

  function startDownload() {
    setDownloadDisabled(true);
    setProgressVisible(true);
    setProgressWidth(0);

    let width = 0;
    const interval = window.setInterval(() => {
      width += Math.random() * 8;
      if (width >= 100) {
        width = 100;
        window.clearInterval(interval);
        setProgressStatus("ERREUR : Votre navigateur est trop vieux pour 16GB.");

        window.setTimeout(() => {
          setDownloadDisabled(false);
          setProgressVisible(false);
          setProgressStatus("");
          setProgressWidth(0);
        }, 3000);
      }

      setProgressWidth(width);
      setProgressStatus(`Injection des données : ${Math.floor(width)}%`);
    }, 150);
  }

  return (
    <>
      <div id="glitch-screen" style={{ display: glitchVisible ? "block" : "none" }}>
        <h1>:(</h1>
        <h2 style={{ marginBottom: 20 }}>
          Votre ordinateur a rencontré un problème technique.
        </h2>
        <p>
          Nous collectons simplement des informations relatives aux erreurs, puis
          nous allons redémarrer l'ordinateur pour vous.
        </p>
        <p style={{ marginTop: 20 }}>100% complet</p>
        <p style={{ marginTop: 40, fontSize: "0.8rem" }}>
          Code d'arrêt : SYSTEM_THREAD_EXCEPTION_NOT_HANDLED (samy_driver.sys)
        </p>
        <p style={{ marginTop: 20 }}>
          Redémarrage forcé dans <span id="crash-timer">{crashTimer}</span> secondes...
        </p>
      </div>

      <nav>
        <div className="container nav-inner">
          <a href="#" className="logo">
            ./oubraham_samy
          </a>
          <div className="mono" style={{ fontSize: "0.7rem" }}>
            SYSTEM_READY: <span style={{ color: "var(--green)" }}>TRUE</span>
          </div>
        </div>
      </nav>

      <section id="hero" className="container">
        <h1 className="hero-title">OUBRAHAM SAMY</h1>
        <p className="hero-tag">&gt; full_stack_architect // local_ghost_hacker</p>
        <div>
          <a href="#terminal-sec" className="btn">
            ACCESS_TERMINAL
          </a>
        </div>
      </section>

      <section id="terminal-sec" className="container">
        <div className="terminal">
          <div className="term-header">
            <div className="dot" style={{ background: "#ff5f56" }} />
            <div className="dot" style={{ background: "#ffbd2e" }} />
            <div className="dot" style={{ background: "#27c93f" }} />
            <span
              style={{
                marginLeft: "auto",
                fontSize: "0.65rem",
                color: "#555",
                fontFamily: "monospace",
              }}
            >
              bash — session_01
            </span>
          </div>

          <div className="term-body" id="terminal-content" ref={terminalRef}>
            {terminalLines.map((html, idx) => (
              <div key={idx} dangerouslySetInnerHTML={{ __html: html }} />
            ))}
            <div className="term-input-line">
              <span style={{ whiteSpace: "nowrap" }}>
                guest@oubraham:{formatPromptPath(cwd)}$
              </span>
              <input
                type="text"
                id="cmd-input"
                autoComplete="off"
                spellCheck={false}
                ref={inputRef}
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onEnterCommand();
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHistoryIndex((prev) => {
                      const start = prev ?? history.length;
                      const next = Math.max(0, start - 1);
                      const val = history[next];
                      if (val !== undefined) setCmd(val);
                      return next;
                    });
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHistoryIndex((prev) => {
                      if (prev === null) return null;
                      const next = prev + 1;
                      if (next >= history.length) {
                        setCmd("");
                        return null;
                      }
                      const val = history[next];
                      if (val !== undefined) setCmd(val);
                      return next;
                    });
                    return;
                  }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    autoComplete();
                  }
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <section id="experiments" className="container">
        <h2 className="mono" style={{ marginBottom: 40, textAlign: "center" }}>
          Experimental_Zone.exe
        </h2>
        <div className="grid">
          <div className="card">
            <h3>BSOD Simulator</h3>
            <p>
              Simule une erreur fatale du noyau Windows. Idéal pour faire peur à vos
              collègues.
            </p>
            <button
              className="btn"
              onClick={triggerCrash}
              style={{ borderColor: "var(--red)", color: "var(--red)" }}
            >
              DÉCLENCHER CRASH
            </button>
          </div>

          <div className="card">
            <h3>Visiteur Tracker</h3>
            <p>Utilise des algorithmes de triangulation pour trouver votre position (humour).</p>
            <div
              id="scan-result"
              className="mono"
              style={{ fontSize: "0.75rem", minHeight: 40, color: "var(--cyan)" }}
            >
              {scanText}
            </div>
            <button className="btn" onClick={startScan}>
              LANCER ANALYSE
            </button>
          </div>

          <div className="card">
            <h3>RAM Booster 3000</h3>
            <p>Augmentez les performances de votre navigateur en téléchargeant de la mémoire vive.</p>
            <div
              className="progress-container"
              id="p-cont"
              style={{ display: progressVisible ? "block" : "none" }}
            >
              <div
                className="progress-bar"
                id="p-bar"
                style={{ width: `${progressWidth}%` }}
              />
            </div>
            <p id="p-status" className="mono" style={{ fontSize: "0.7rem", color: "var(--green)" }}>
              {progressStatus}
            </p>
            <button className="btn" id="dl-btn" onClick={startDownload} disabled={downloadDisabled}>
              DOWNLOAD 16GB RAM
            </button>
          </div>

          <div className="card">
            <h3>The Matrix Flux</h3>
            <p>Altère la perception visuelle du site pour voir le code derrière la réalité.</p>
            <button className="btn" onClick={() => setMatrixActive((v) => !v)}>
              TOGGLE REALITY
            </button>
          </div>
        </div>
      </section>

      <section id="contact" className="container" style={{ padding: "60px 0", textAlign: "center" }}>
        <h2 className="mono" style={{ fontSize: "1.5rem", marginBottom: 15 }}>
          ./Contact_Me
        </h2>
        <p style={{ marginBottom: 30, color: "var(--muted)", fontSize: "0.9rem" }}>
          Si vous voulez un site aussi interactif que celui-ci (mais en plus sérieux).
        </p>
        <a href="mailto:contact@xo-link.com" className="btn">
          ENVOYER UN MAIL
        </a>
      </section>

      <footer>
        <p>© 2026 OUBRAHAM SAMY — NO SYSTEMS ARE SAFE</p>
      </footer>
    </>
  );
}
