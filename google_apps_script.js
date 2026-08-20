/**
 * ===================================================================
 * GOOGLE APPS SCRIPT - INTEGRAÇÃO LEITOR DE INVENTÁRIO (WEBHOOK)
 * ===================================================================
 * 
 * Totalmente Dinâmico:
 * - Você pode mudar as colunas de lugar em qualquer uma das abas!
 * - O script localiza as colunas pelo nome do cabeçalho automaticamente.
 * 
 * Abas Suportadas:
 * - "estoque fisico": Onde o aplicativo salva as contagens.
 * - "estoque sistema aparelhos": Base cadastral do ERP/SAP para comparação.
 * 
 * ===================================================================
 */

// 1. RECEBER DADOS DO CELULAR (SALVA NA ABA 'estoque fisico')
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("estoque fisico") || ss.getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Se a aba estiver vazia, cria os cabeçalhos padrão
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Patrimônio", "Modelo", "Nº Série", "EAN", "Observação", "Quantidade", "Data/Hora"]);
    }
    
    // Lê os cabeçalhos da primeira linha para saber a posição exata de cada coluna
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 7)).getValues()[0];
    var headerNormalized = headers.map(function(h) { 
      return String(h).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[º]/g, "o").replace(/[ª]/g, "a").trim(); 
    });
    
    var colPat = headerNormalized.indexOf("patrimonio") !== -1 ? headerNormalized.indexOf("patrimonio") : headerNormalized.indexOf("etiqueta");
    var colMod = headerNormalized.indexOf("modelo") !== -1 ? headerNormalized.indexOf("modelo") : headerNormalized.indexOf("material");
    var colSer = headerNormalized.indexOf("no serie") !== -1 ? headerNormalized.indexOf("no serie") : (headerNormalized.indexOf("serie") !== -1 ? headerNormalized.indexOf("serie") : headerNormalized.indexOf("numeroserie"));
    var colEan = headerNormalized.indexOf("ean") !== -1 ? headerNormalized.indexOf("ean") : headerNormalized.indexOf("cod. barras");
    var colObs = headerNormalized.indexOf("observacao") !== -1 ? headerNormalized.indexOf("observacao") : headerNormalized.indexOf("obs");
    var colQtd = headerNormalized.indexOf("quantidade") !== -1 ? headerNormalized.indexOf("quantidade") : headerNormalized.indexOf("qtd");
    var colDat = headerNormalized.indexOf("data/hora") !== -1 ? headerNormalized.indexOf("data/hora") : (headerNormalized.indexOf("data") !== -1 ? headerNormalized.indexOf("data") : headerNormalized.indexOf("timestamp"));

    var numCols = Math.max(headers.length, 7);
    
    // Monta a linha de dados na ordem correta das colunas
    var newRow = new Array(numCols).fill("");
    if (colPat !== -1) newRow[colPat] = data.patrimonio || '';
    if (colMod !== -1) newRow[colMod] = data.modelo || '';
    if (colSer !== -1) newRow[colSer] = data.serie || '';
    if (colEan !== -1) newRow[colEan] = data.ean || '';
    if (colObs !== -1) newRow[colObs] = data.obs || '';
    if (colQtd !== -1) newRow[colQtd] = data.quantity || 1;
    if (colDat !== -1) newRow[colDat] = data.timestamp || new Date().toLocaleString('pt-BR');
    
    // ---------------------------------------------------------------
    // MODO ATUALIZAÇÃO: Busca a linha existente pelo timestamp e atualiza
    // ---------------------------------------------------------------
    if (data.isUpdate && data.timestamp) {
      var allData = sheet.getDataRange().getValues();
      var timestampCol = colDat !== -1 ? colDat : 6; // fallback coluna G
      var foundRow = -1;
      
      for (var r = 1; r < allData.length; r++) {
        var cellTimestamp = String(allData[r][timestampCol] || '').trim();
        if (cellTimestamp === String(data.timestamp).trim()) {
          foundRow = r + 1; // Converte de 0-index para 1-index do Sheets
          break;
        }
      }
      
      if (foundRow > 1) {
        // Atualiza a linha existente sem inserir nova
        sheet.getRange(foundRow, 1, 1, numCols).setValues([newRow]);
        
        return ContentService
          .createTextOutput(JSON.stringify({ "status": "sucesso", "acao": "atualizado", "linha": foundRow }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      // Se não encontrou a linha original, continua abaixo e insere como nova
    }
    
    // ---------------------------------------------------------------
    // MODO INSERÇÃO: Insere na linha 2 (topo) como novo item
    // ---------------------------------------------------------------
    if (colPat !== -1 || colSer !== -1 || colMod !== -1) {
      sheet.insertRowBefore(2);
      sheet.getRange(2, 1, 1, numCols).setValues([newRow]);
    } else {
      // Fallback padrão se não houver cabeçalhos reconhecidos
      var fallbackRow = [
        data.patrimonio || '',
        data.modelo || '',
        data.serie || '',
        data.ean || '',
        data.obs || '',
        data.quantity || 1,
        data.timestamp || new Date().toLocaleString('pt-BR')
      ];
      sheet.insertRowBefore(2);
      sheet.getRange(2, 1, 1, 7).setValues([fallbackRow]);
    }
    
    // Copiar fórmulas das colunas extras (H, I, etc.) da linha 3 para a nova linha 2
    var totalCols = sheet.getLastColumn();
    var dataCols = Math.max(headers.length, 7);
    if (totalCols > dataCols && sheet.getLastRow() >= 3) {
      var formulaSource = sheet.getRange(3, dataCols + 1, 1, totalCols - dataCols);
      formulaSource.copyTo(sheet.getRange(2, dataCols + 1, 1, totalCols - dataCols));
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ "status": "sucesso", "acao": "inserido" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ "status": "erro", "detalhe": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. ENVIAR DADOS PARA O CELULAR (LÊ AS DUAS ABAS DINAMICAMENTE)
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // -------------------------------------------------------------
    // A. LER ABA 'estoque fisico'
    // -------------------------------------------------------------
    var sheetFisico = ss.getSheetByName("estoque fisico") || ss.getActiveSheet();
    var rowsFisico = sheetFisico.getDataRange().getValues();
    var itensFisicos = [];
    
    if (rowsFisico.length > 1) {
      var headerF = rowsFisico[0].map(function(h) { 
        return String(h).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[º]/g, "o").replace(/[ª]/g, "a").trim(); 
      });
      
      var colFPat = headerF.indexOf("patrimonio") !== -1 ? headerF.indexOf("patrimonio") : 0;
      var colFMod = headerF.indexOf("modelo") !== -1 ? headerF.indexOf("modelo") : 1;
      // BUG FIX: expressão ternária anterior calculava o indexOf duas vezes desnecessariamente
      var _colFSerIdx1 = headerF.indexOf("no serie");
      var _colFSerIdx2 = headerF.indexOf("serie");
      var colFSer = _colFSerIdx1 !== -1 ? _colFSerIdx1 : (_colFSerIdx2 !== -1 ? _colFSerIdx2 : 2);
      var colFEan = headerF.indexOf("ean") !== -1 ? headerF.indexOf("ean") : 3;

      for (var i = 1; i < rowsFisico.length; i++) {
        var rowF = rowsFisico[i];
        var pat = String(rowF[colFPat] || '').trim();
        var mod = String(rowF[colFMod] || '').trim();
        var ser = String(rowF[colFSer] || '').trim();
        var ean = String(rowF[colFEan] || '').trim();

        if (pat || mod || ser || ean) {
          itensFisicos.push({
            patrimonio: pat,
            modelo: mod,
            serie: ser,
            ean: ean
          });
        }
      }
    }
    
    // -------------------------------------------------------------
    // B. LER ABA 'estoque sistema aparelhos'
    // -------------------------------------------------------------
    var sheetSistema = ss.getSheetByName("estoque sistema aparelhos");
    var itensSistema = [];
    
    if (sheetSistema) {
      var rowsSistema = sheetSistema.getDataRange().getValues();
      if (rowsSistema.length > 1) {
        var headerS = rowsSistema[0].map(function(h) { 
          return String(h).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[º]/g, "o").replace(/[ª]/g, "a").trim(); 
        });
        
        var colMaterial = headerS.indexOf("material");
        var colEtiqueta = headerS.indexOf("ultimaetiqueta") !== -1 ? headerS.indexOf("ultimaetiqueta") : (headerS.indexOf("etiqueta") !== -1 ? headerS.indexOf("etiqueta") : headerS.indexOf("patrimonio"));
        var colSerie = headerS.indexOf("numeroserie") !== -1 ? headerS.indexOf("numeroserie") : headerS.indexOf("serie");
        
        for (var j = 1; j < rowsSistema.length; j++) {
          var rowS = rowsSistema[j];
          var mat = colMaterial !== -1 ? String(rowS[colMaterial] || '').trim() : '';
          var etq = colEtiqueta !== -1 ? String(rowS[colEtiqueta] || '').trim() : '';
          var serS = colSerie !== -1 ? String(rowS[colSerie] || '').trim() : '';
          
          if (etq || serS || mat) {
            itensSistema.push({
              material: mat,
              etiqueta: etq,
              serie: serS
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
