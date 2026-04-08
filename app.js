let rules = {};
let sourcePdfBytes = null;
let pagesData = [];

const categories = [
  "Structural",
  "Architectural",
  "Mechanical",
  "Fire Protection",
  "Other"
];

const pdfFile = document.getElementById("pdfFile");
const analyzeBtn = document.getElementById("analyzeBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusBox = document.getElementById("status");
const resultsBox = document.getElementById("results");

analyzeBtn.addEventListener("click", analyzePdf);
downloadBtn.addEventListener("click", downloadPdfs);

init().catch((err) => {
  console.error(err);
  statusBox.textContent = "Could not load rules.json.";
});

async function init() {
  const response = await fetch("rules.json");
  rules = await response.json();
  statusBox.textContent = "Ready.";
}

function normalize(text) {
  return (text || "").toUpperCase().replace(/\s+/g, " ").trim();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function extractSheetNumber(text) {
  const patterns = [
    /\b(FP|FS|S|A|M)\s*-?\s*\d+(?:\.\d+)?\b/i,
    /\b(FP|FS|S|A|M)\d+(?:\.\d+)?\b/i
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match) return match[0].replace(/\s+/g, " ").trim();
  }

  return "";
}

function scoreCategory(text, categoryRules) {
  let score = 0;
  const t = normalize(text);

  for (const prefix of (categoryRules.prefixes || [])) {
    const re = new RegExp(`\\b${escapeRegExp(prefix.toUpperCase())}\\s*-?\\s*\\d`, "i");
    if (re.test(t)) score += 4;
  }

  for (const keyword of (categoryRules.keywords || [])) {
    if (t.includes(keyword.toUpperCase())) score += 2;
  }

  return score;
}

function classifyText(text) {
  let bestCategory = "Other";
  let bestScore = 0;

  for (const [category, categoryRules] of Object.entries(rules)) {
    const score = scoreCategory(text, categoryRules);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (bestScore < 4) {
    return { category: "Other", score: bestScore };
  }

  return { category: bestCategory, score: bestScore };
}

async function analyzePdf() {
  const file = pdfFile.files[0];
  if (!file) {
    statusBox.textContent = "Choose a PDF first.";
    return;
  }

  sourcePdfBytes = await file.arrayBuffer();
  statusBox.textContent = "Reading pages...";

  const loadingTask = pdfjsLib.getDocument({ data: sourcePdfBytes });
  const pdf = await loadingTask.promise;

  pagesData = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item) => item.str).join(" ");
    const sheetNumber = extractSheetNumber(text);
    const { category, score } = classifyText(text);

    pagesData.push({
      page: i,
      sheetNumber,
      text,
      category,
      score
    });
  }

  renderResults();
  downloadBtn.disabled = false;
  statusBox.textContent = `Read ${pagesData.length} pages. Review anything wrong, then download.`;
}

function renderResults() {
  const counts = categories
    .map((cat) => `${cat}: ${pagesData.filter((p) => p.category === cat).length}`)
    .join(" | ");

  let html = `<p><strong>Counts:</strong> ${counts}</p>`;
  html += `
    <table>
      <thead>
        <tr>
          <th style="width: 60px;">Page</th>
          <th style="width: 120px;">Sheet</th>
          <th style="width: 190px;">Category</th>
          <th style="width: 120px;">Confidence</th>
          <th>Text preview</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const page of pagesData) {
    html += `
      <tr>
        <td>${page.page}</td>
        <td>${escapeHtml(page.sheetNumber || "-")}</td>
        <td>
          <select data-page="${page.page}">
            ${categories.map((cat) => `
              <option value="${cat}" ${cat === page.category ? "selected" : ""}>${cat}</option>
            `).join("")}
          </select>
        </td>
        <td>${page.score >= 6 ? "High" : page.score >= 4 ? "Medium" : "Review"}</td>
        <td><small>${escapeHtml(page.text.slice(0, 180))}${page.text.length > 180 ? "..." : ""}</small></td>
      </tr>
    `;
  }

  html += `</tbody></table>`;
  resultsBox.innerHTML = html;

  resultsBox.querySelectorAll("select[data-page]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const pageNum = Number(event.target.dataset.page);
      const page = pagesData.find((p) => p.page === pageNum);
      if (page) {
        page.category = event.target.value;
        renderResults();
      }
    });
  });
}

async function downloadPdfs() {
  if (!sourcePdfBytes || pagesData.length === 0) {
    statusBox.textContent = "Read a PDF first.";
    return;
  }

  statusBox.textContent = "Creating split PDFs...";

  const sourceDoc = await PDFLib.PDFDocument.load(sourcePdfBytes);

  for (const category of categories) {
    const indices = pagesData
      .filter((p) => p.category === category)
      .map((p) => p.page - 1);

    if (!indices.length) continue;

    const outDoc = await PDFLib.PDFDocument.create();
    const copiedPages = await outDoc.copyPages(sourceDoc, indices);
    copiedPages.forEach((page) => outDoc.addPage(page));

    const pdfBytes = await outDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${category.replace(/\s+/g, "_")}.pdf`;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  statusBox.textContent = "Done. Your downloads should have started.";
}