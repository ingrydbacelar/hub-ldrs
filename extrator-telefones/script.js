// Endereço da API (backend) depois de publicada. Troque pelo seu.
const API_URL = "https://SEU-SERVIDOR.onrender.com";
const CONCORRENCIA = 3;

const $ = (id) => document.getElementById(id);
const btnIniciar = $("btnIniciar");
const btnParar = $("btnParar");
const btnCopiar = $("btnCopiar");
const btnCsv = $("btnCsv");
const statusTexto = $("statusTexto");
const progressoWrap = $("progressoWrap");
const progressoFill = $("progressoFill");
const progressoLabel = $("progressoLabel");
const tabelaBody = $("tabelaBody");
const urlsInput = $("urls");
const tokenInput = $("token");

const ROTULO_STATUS = {
  ok: "ok",
  lento: "lento",
  fora_do_ar: "fora do ar",
  sem_telefone: "sem telefone",
  bloqueado: "bloqueado",
  erro: "erro",
};

let linhas = [];
let cancelar = false;

try { tokenInput.value = localStorage.getItem("extrator-token") || ""; } catch (e) {}

function lerUrls() {
  const vistos = new Set();
  return urlsInput.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((u) => !vistos.has(u) && vistos.add(u));
}

function td(texto) {
  const c = document.createElement("td");
  if (texto != null) c.textContent = texto;
  return c;
}

function criarLinha(url, indice) {
  const tr = document.createElement("tr");
  tr.className = "status-espera";
  const res = td();
  const principal = document.createElement("span");
  principal.textContent = "—";
  const detalhe = document.createElement("span");
  detalhe.className = "detalhe";
  res.append(principal, detalhe);
  const st = td("aguardando");
  tr.append(td(indice), td(url), res, st);
  tabelaBody.append(tr);
  return { url, tr, principal, detalhe, st, resultado: null };
}

function mostrar(l, r) {
  l.resultado = r;
  const status = r.status || (r.telefone ? "ok" : "erro");
  const achou = Boolean(r.telefone);

  l.tr.className = achou
    ? "status-ok"
    : status === "fora_do_ar" || status === "erro"
      ? "status-erro"
      : "status-aviso";

  l.principal.textContent = achou ? r.telefone : (r.erro || "Nenhum telefone encontrado");
  l.st.textContent = ROTULO_STATUS[status] || status;
  l.st.classList.toggle("tag-lento", achou && status === "lento");

  const partes = [];
  if (achou) {
    if (status === "lento") partes.push("Site lento (" + r.tempo + " s)");
    const outros = (r.todos || []).slice(1).map((t) => t.numero);
    if (outros.length) partes.push("Outros: " + outros.join(", "));
    const origem = r.todos && r.todos[0] ? r.todos[0].fontes.join(", ") : "";
    if (origem) partes.push("Origem: " + origem);
  }
  l.detalhe.textContent = partes.join("; ");
}

function atualizarProgresso(total, feitos, rodando) {
  if (total === 0) { progressoWrap.hidden = true; return; }
  progressoWrap.hidden = false;
  progressoFill.style.width = Math.round((feitos / total) * 100) + "%";
  progressoLabel.textContent = feitos + " / " + total;
  if (rodando) statusTexto.textContent = "Extraindo...";
}

async function extrair(url, token) {
  const falha = (erro) => ({ url, status: "erro", telefone: null, todos: [], erro });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Token"] = token;
    const r = await fetch(API_URL.replace(/\/$/, "") + "/extrair", {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
    });
    if (r.status === 401) return falha("Chave de acesso inválida");
    if (!r.ok) return falha("O servidor respondeu com erro " + r.status);
    return await r.json();
  } catch (e) {
    return falha(e.name === "AbortError" ? "Tempo esgotado" : "Não foi possível falar com o servidor");
  } finally {
    clearTimeout(t);
  }
}

function resumo() {
  const c = { com: 0, sem: 0, fora: 0, lentos: 0, outros: 0 };
  linhas.forEach((l) => {
    const r = l.resultado;
    if (!r) return;
    if (r.telefone) c.com++;
    else if (r.status === "fora_do_ar") c.fora++;
    else if (r.status === "lento") c.lentos++;
    else if (r.status === "sem_telefone") c.sem++;
    else c.outros++;
  });
  const partes = [];
  if (c.com) partes.push(c.com + " com telefone");
  if (c.sem) partes.push(c.sem + " sem telefone");
  if (c.fora) partes.push(c.fora + " fora do ar");
  if (c.lentos) partes.push(c.lentos + " lentos sem resultado");
  if (c.outros) partes.push(c.outros + " com outros erros");
  return partes.join("; ");
}

btnIniciar.addEventListener("click", async () => {
  const urls = lerUrls();
  if (!urls.length) { statusTexto.textContent = "Cole ao menos uma URL."; return; }
  if (API_URL.includes("SEU-SERVIDOR")) {
    statusTexto.textContent = "Defina o endereço da API (API_URL) no arquivo script.js.";
    return;
  }
  const token = tokenInput.value.trim();
  try { localStorage.setItem("extrator-token", token); } catch (e) {}

  tabelaBody.replaceChildren();
  linhas = urls.map((u, i) => criarLinha(u, i + 1));
  $("resultados").hidden = false;
  btnIniciar.disabled = true;
  btnCopiar.disabled = true;
  btnCsv.disabled = true;
  btnParar.hidden = false;
  cancelar = false;

  let proximo = 0, feitos = 0;
  atualizarProgresso(urls.length, 0, true);

  async function worker() {
    while (!cancelar && proximo < linhas.length) {
      const l = linhas[proximo++];
      l.st.textContent = "buscando";
      mostrar(l, await extrair(l.url, token));
      feitos++;
      atualizarProgresso(urls.length, feitos, true);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, linhas.length) }, worker));

  linhas.filter((l) => !l.resultado).forEach((l) => { l.st.textContent = "não processado"; });
  statusTexto.textContent = (cancelar ? "Interrompido. " : "Concluído: ") + resumo() + ".";
  btnIniciar.disabled = false;
  btnParar.hidden = true;
  btnCopiar.disabled = feitos === 0;
  btnCsv.disabled = feitos === 0;
});

btnParar.addEventListener("click", () => { cancelar = true; });

btnCopiar.addEventListener("click", async () => {
  const texto = linhas
    .map((l) => l.url + "\t" + ((l.resultado && (l.resultado.telefone || l.resultado.erro)) || ""))
    .join("\n");
  try {
    await navigator.clipboard.writeText(texto);
    statusTexto.textContent = "Copiado. Cole direto na planilha.";
  } catch (e) {
    statusTexto.textContent = "O navegador bloqueou a cópia. Use o CSV.";
  }
});

function montarCsv() {
  const q = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
  const rows = [["Site", "Telefone principal", "Outros números", "Observação"]];
  linhas.forEach((l) => {
    const r = l.resultado || {};
    rows.push([
      l.url,
      r.telefone || "",
      (r.todos || []).slice(1).map((t) => t.numero).join(" / "),
      r.telefone ? (r.status === "lento" ? "Site lento" : "") : (r.erro || ""),
    ]);
  });
  return "\ufeff" + rows.map((r) => r.map(q).join(";")).join("\r\n");
}

btnCsv.addEventListener("click", () => {
  const blob = new Blob([montarCsv()], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "telefones.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});
