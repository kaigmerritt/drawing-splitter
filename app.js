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
const copyRangesBtn = document.getElementById("copyRangesBtn");
const statusBox = document.getElementById("status");
const resultsBox = document.getElementById("results");

analyzeBtn.addEventListener("click", analyzePdf);
copyRangesBtn.addEventListener("click", copyRanges);

// -------- ANALYZE WITH SHEET DETECTION --------
async function analyzePdf() {
  try {
    const file = pdfFile.files[0];
    if (!file) {
      statusBox.textContent = "Choose a PDF first.";
      return;
    }

    statusBox.textContent = "Scanning pages...";

    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

    pagesData = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      if (i % 10 === 0) {
        statusBox.textContent = `Scanning page ${i} of ${pdf.numPages}...`;
        await new Promise(r => setTimeout(r, 0));
      }

      const page = await pdf.getPage(i);

      const textContent = await page.getTextContent();
      const text = textContent.items
        .slice(0, 50)
        .map(item => item.str)
        .join(" ")
        .toUpperCase();

      let category = "Other";
      let sheet = "";

      // Detect sheet number (S1.1, A2.0, etc.)
      const match = text.match(/\b(FP|FS|S|A|M)\s?-?\d+(\.\d+)?\b/);

      if (match) {
        sheet = match[0].replace(/\s+/g, "");

        if (sheet.startsWith("S")) category = "Structural";
        else if (sheet.startsWith("A")) category = "Architectural";
        else if (sheet.startsWith("M")) category = "Mechanical";
        else if (sheet.startsWith("FP") || sheet.startsWith("FS")) category = "Fire Protection";
      }

      pagesData.push({
        page: i,
        category,
        sheet
      });
    }

    renderResults();
    statusBox.textContent = "Done. Review categories if needed.";

  } catch (err) {
    console.error(err);
    statusBox.textContent = "PDF too large or unreadable. Try smaller file.";
  }
}

// -------- RENDER TABLE --------
function renderResults() {
  let html = "<table><tr><th>Page</th><th>Sheet</th><th>Category</th></tr>";

  for (const page of pagesData) {
    html += `
      <tr>
        <td>${page.page}</td>
        <td>${page.sheet || "-"}</td>
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

// -------- GENERATE PAGE RANGES --------
function generateRanges() {
  const ranges = {};

  categories.forEach(cat => {
    const pages = pagesData
      .filter(p => p.category === cat)
      .map(p => p.page);

    if (!pages.length) return;

    let start = pages[0];
    let prev = pages[0];
    const result = [];

    for (let i = 1; i < pages.length; i++) {
      if (pages[i] === prev + 1) {
        prev = pages[i];
      } else {
        result.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = pages[i];
        prev = pages[i];
      }
    }

    result.push(start === prev ? `${start}` : `${start}-${prev}`);

    ranges[cat] = result.join(", ");
  });

  return ranges;
}

// -------- COPY TO CLIPBOARD --------
function copyRanges() {
  const ranges = generateRanges();

  let text = "";

  for (const [cat, range] of Object.entries(ranges)) {
    text += `${cat}: ${range}\n`;
  }

  navigator.clipboard.writeText(text);
  statusBox.textContent = "Page ranges copied. Paste into Bluebeam.";
}