async function analyzePdf() {
  const file = pdfFile.files[0];
  if (!file) {
    statusBox.textContent = "Choose a PDF first.";
    return;
  }

  sourcePdfBytes = await file.arrayBuffer();
  statusBox.textContent = "Reading pages (fast mode)...";

  const loadingTask = pdfjsLib.getDocument({ data: sourcePdfBytes });
  const pdf = await loadingTask.promise;

  pagesData = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    if (i % 5 === 0) {
      statusBox.textContent = `Processing page ${i} of ${pdf.numPages}...`;
      await new Promise(r => setTimeout(r, 0)); // prevents freezing
    }

    const page = await pdf.getPage(i);

    // LIGHTER text extraction (prevents freezing on large/scanned PDFs)
    const textContent = await page.getTextContent({
      disableCombineTextItems: true
    });

    const text = textContent.items
      .slice(0, 50) // limit how much text we read
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
  statusBox.textContent = `Done. Review pages, then download.`;
}