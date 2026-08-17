/**
 * ===================================================================
 * GOOGLE APPS SCRIPT - INTEGRAÇÃO LEITOR DE INVENTÁRIO (WEBHOOK)
 * ===================================================================
 * 
 * INSTRUÇÕES DE USO:
 * 1. Abra a sua planilha no Google Sheets.
 * 2. No menu superior, clique em: Extensões > Apps Script.
 * 3. Copie todo o código deste arquivo e cole lá, substituindo o que estiver.
 * 4. Clique no ícone de Salvar (Disquete).
 * 5. Clique no botão azul superior: Implantar > Gerenciar Implantações.
 * 6. Clique no ícone de Lápis (Editar), selecione "Nova Versão" e clique em "Implantar".
 * 
 * ===================================================================
 */

// 1. RECEBER DADOS DO CELULAR (SALVAR NOVO PRODUTO NA PLANILHA)
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Adiciona a nova linha com os dados recebidos do app
    sheet.appendRow([
      data.patrimonio || '',
      data.modelo || '',
      data.serie || '',
      data.ean || '',
      data.obs || '',
      data.quantity || 1,
      data.timestamp || new Date().toLocaleString('pt-BR')
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ "status": "sucesso" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ "status": "erro", "detalhe": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. ENVIAR DADOS PARA O CELULAR (LER A PLANILHA AO ABRIR O APP)
// Isso alimenta a proteção de duplicidade e o auto-preenchimento em qualquer celular/navegador
function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var rows = sheet.getDataRange().getValues();
    
    var items = [];
    
    // Pula a primeira linha (cabeçalho da planilha)
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      // Só adiciona se houver pelo menos um código preenchido na linha
      if (row[0] || row[1] || row[2] || row[3]) {
        items.push({
          patrimonio: String(row[0] || '').trim(),
          modelo: String(row[1] || '').trim(),
          serie: String(row[2] || '').trim(),
          ean: String(row[3] || '').trim()
        });
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        "status": "sucesso",
        "total": items.length,
        "data": items
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        "status": "erro",
        "detalhe": error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
