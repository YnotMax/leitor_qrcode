/**
 * ===================================================================
 * GOOGLE APPS SCRIPT - INTEGRAÇÃO LEITOR DE INVENTÁRIO (WEBHOOK)
 * ===================================================================
 * 
 * Abas Suportadas:
 * - "estoque fisico": Onde o aplicativo salva as contagens realizadas.
 * - "estoque sistema aparelhos": Base do sistema para validação, lookup e comparação.
 * 
 * INSTRUÇÕES DE ATUALIZAÇÃO:
 * 1. Abra a sua planilha no Google Sheets.
 * 2. No menu superior: Extensões > Apps Script.
 * 3. Substitua todo o código por este e clique no ícone de Salvar (Disquete).
 * 4. Clique em: Implantar > Gerenciar Implantações > Lápis (Editar) > Nova Versão > Implantar.
 * 
 * ===================================================================
 */

// 1. RECEBER DADOS DO CELULAR (SALVA SEMPRE NA ABA 'estoque fisico')
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Garante que grava na aba 'estoque fisico' mesmo se o usuário estiver vendo outra aba
    var sheet = ss.getSheetByName("estoque fisico") || ss.getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Adiciona a nova linha na aba de estoque físico
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

// 2. ENVIAR DADOS PARA O CELULAR (LÊ AS DUAS ABAS: FÍSICO E SISTEMA)
// Isso alimenta a proteção de duplicidade e o auto-preenchimento inteligente de materiais
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // -------------------------------------------------------------
    // A. LER ABA 'estoque fisico' (Itens já contados fisicamente)
    // -------------------------------------------------------------
    var sheetFisico = ss.getSheetByName("estoque fisico") || ss.getActiveSheet();
    var rowsFisico = sheetFisico.getDataRange().getValues();
    var itensFisicos = [];
    
    for (var i = 1; i < rowsFisico.length; i++) {
      var rowF = rowsFisico[i];
      if (rowF[0] || rowF[1] || rowF[2] || rowF[3]) {
        itensFisicos.push({
          patrimonio: String(rowF[0] || '').trim(),
          modelo: String(rowF[1] || '').trim(),
          serie: String(rowF[2] || '').trim(),
          ean: String(rowF[3] || '').trim()
        });
      }
    }
    
    // -------------------------------------------------------------
    // B. LER ABA 'estoque sistema aparelhos' (Base cadastral do sistema)
    // -------------------------------------------------------------
    var sheetSistema = ss.getSheetByName("estoque sistema aparelhos");
    var itensSistema = [];
    
    if (sheetSistema) {
      var rowsSistema = sheetSistema.getDataRange().getValues();
      if (rowsSistema.length > 1) {
        var header = rowsSistema[0].map(function(h) { return String(h).trim().toLowerCase(); });
        
        var colMaterial = header.indexOf("material");
        var colEtiqueta = header.indexOf("ultimaetiqueta") !== -1 ? header.indexOf("ultimaetiqueta") : header.indexOf("etiqueta");
        var colSerie = header.indexOf("numeroserie") !== -1 ? header.indexOf("numeroserie") : header.indexOf("serie");
        
        for (var j = 1; j < rowsSistema.length; j++) {
          var rowS = rowsSistema[j];
          var mat = colMaterial !== -1 ? String(rowS[colMaterial] || '').trim() : '';
          var etq = colEtiqueta !== -1 ? String(rowS[colEtiqueta] || '').trim() : '';
          var ser = colSerie !== -1 ? String(rowS[colSerie] || '').trim() : '';
          
          if (etq || ser || mat) {
            itensSistema.push({
              material: mat,
              etiqueta: etq,
              serie: ser
            });
          }
        }
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        "status": "sucesso",
        "total": itensFisicos.length,
        "data": itensFisicos,
        "totalSistema": itensSistema.length,
        "sistema": itensSistema
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
