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
  statusBox.textContent = "Error loading rules.json.";
});

async function init() {
  const response = await fetch("rules.json");
  rules = await response.json();
  statusBox.textContent = "Ready.";
}

function normalize(text) {
  return (text || "").toUpperCase().replace(/\s+/g, " ").trim();
}

function extractSheetNumber(text) {
  const patterns = [
    /\b(FP|FS|S|A|M)\s*-?\s*\d+(?:\.\d+)?\b/i,
    /\b(FP|FS|S|A|M)\d+(?:\.\d+)?\b/i
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match) return match[0];
  }

  return "";
}

function classifyText(text) {
  const t = normalize(text);

  if (/\bS\d/.test(t) || t.includes("FRAMING") || t.includes("STEEL")) return { category: "Structural", score: 5 };
  if (/\bA\d/.test(t) || t.includes("PLAN") || t.includes("ELEVATION")) return { category: "Architectural", score: 5 };
  if (/\bM\d/.test(t) || t.includes("HVAC") || t.includes("DUCT")) return { category: "Mechanical", score: 5 };
  if (/\bFP\d/.test(t) || t.includes("SPRINKLER")) return { category: "Fire Protection", score: 5 };

  return { category: "Other", score: 1 };
}

async function analyzePdf() {
  try {
    const file = pdfFile.files[0];
    if (!file) {
      statusBox.textContent = "Choose a PDF first.";
      return;
    }

    sourcePdfBytes = await file.arrayBuffer();
    statusBox.textContent = "Processing...";

    const pdf = await pdfjsLib.getDocument({ data: sourcePdfBytes }).promise;

    pagesData = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      if (i % 5 === 0) {
        statusBox.textContent = `Processing page ${i} of ${pdf.numPages}...`;
        await new Promise(r => setTimeout(r, 0));
      }

      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const text = textContent.items
        .slice(0, 40)
        .map(item => item.str)
        .join(" ");

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
    statusBox.textContent = "Done. Review pages, then download.";

  } catch (err) {
    console.error(err);
    statusBox.textContent = "Error processing PDF. Try a smaller file first.";
  }
}

function renderResults() {
  let html = "<table><tr><th>Page</th><th>Sheet</th><th>Category</th></tr>";

  for (const page of pagesData) {
    html += `
      <tr>
        <td>${page.page}</td>
        <td>${page.sheetNumber || "-"}</td>
        <td>
          <select data-page="${page.page}">
            ${categories.map(c =>
              `<option ${c === page.category ? "selected" : ""}>${c}</option>`
            ).join("")}
          </select>
        </td>
      </tr>
    `;
  }

  html += "</table>";
  resultsBox.innerHTML = html;

  resultsBox.querySelectorAll("select").forEach(select => {
    select.addEventListener("change", (e) => {
      const p = pagesData.find(x => x.page == e.target.dataset.page);
      p.category = e.target.value;
    });
  });
}

async function downloadPdfs() {
  const sourceDoc = await PDFLib.PDFDocument.load(sourcePdfBytes);

  for (const category of categories) {
    const pages = pagesData
      .filter(p => p.category === category)
      .map(p => p.page - 1);

    if (!pages.length) continue;

    const newDoc = await PDFLib.PDFDocument.create();
    const copied = await newDoc.copyPages(sourceDoc, pages);
    copied.forEach(p => newDoc.addPage(p));

    const bytes = await newDoc.save();
    const blob = new Blob([bytes], { type: "application/pdf" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = category + ".pdf";
    a.click();
  }

  statusBox.textContent = "Download complete.";
}