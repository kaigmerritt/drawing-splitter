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
  statusBox.textContent = "Ready.";
}

// ---------- ANALYZE (FAST MODE) ----------
async function analyzePdf() {
  try {
    const file = pdfFile.files[0];
    if (!file) {
      statusBox.textContent = "Choose a PDF first.";
      return;
    }

    sourcePdfBytes = await file.arrayBuffer();
    statusBox.textContent = "Scanning pages...";

    const pdf = await pdfjsLib.getDocument({ data: sourcePdfBytes }).promise;

    pagesData = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      if (i % 10 === 0) {
        statusBox.textContent = `Scanning page ${i} of ${pdf.numPages}...`;
        await new Promise(r => setTimeout(r, 0));
      }

      // FAST DEFAULT SORT (user will adjust)
      let category = "Other";

      if (i < 20) category = "Other";
      else if (i < 80) category = "Architectural";
      else if (i < 140) category = "Structural";
      else category = "Mechanical";

      pagesData.push({
        page: i,
        sheetNumber: "",
        text: "",
        category,
        score: 1
      });
    }

    renderResults();
    downloadBtn.disabled = false;
    statusBox.textContent = "Done. Review categories, then download.";

  } catch (err) {
    console.error(err);
    statusBox.textContent = "Error processing PDF. File too large or corrupted.";
  }
}

// ---------- RENDER TABLE ----------
function renderResults() {
  let html = "<table><tr><th>Page</th><th>Category</th></tr>";

  for (const page of pagesData) {
    html += `
      <tr>
        <td>${page.page}</td>
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
      if (p) p.category = e.target.value;
    });
  });
}

// ---------- DOWNLOAD (CHUNKED SAFE MODE) ----------
async function downloadPdfs() {
  if (!sourcePdfBytes || pagesData.length === 0) {
    statusBox.textContent = "Read a PDF first.";
    return;
  }

  const sourceDoc = await PDFLib.PDFDocument.load(sourcePdfBytes);

  for (const category of categories) {
    statusBox.textContent = `Creating ${category} PDF...`;

    const pages = pagesData
      .filter(p => p.category === category)
      .map(p => p.page - 1);

    if (!pages.length) continue;

    const newDoc = await PDFLib.PDFDocument.create();

    // CHUNK PROCESSING (prevents crashes)
    for (let i = 0; i < pages.length; i += 20) {
      const chunk = pages.slice(i, i + 20);
      const copied = await newDoc.copyPages(sourceDoc, chunk);
      copied.forEach(p => newDoc.addPage(p));
    }

    const bytes = await newDoc.save();

    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = category.replace(/\s+/g, "_") + ".pdf";
    a.click();
  }

  statusBox.textContent = "All PDFs created.";
}