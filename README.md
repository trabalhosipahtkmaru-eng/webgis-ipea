diff --git a/README.md b/README.md
index 1c1dcaac63d64368dcbf9e86be6fd1d52ae994e9..8cfacbe1c64a32c7ad57d78b356d7731cba2f7a4 100644
--- a/README.md
+++ b/README.md
@@ -1,12 +1,24 @@
 # WebGIS IPEA – Protótipo
 
 Protótipo de WebGIS para visualização, filtragem e inspeção de dados territoriais.
 
 ## Funcionalidades
 - Camadas vetoriais (GeoJSON)
 - Filtros por região, UF e hierarquia
 - Painel de informações dinâmico
-- Exportação CSV da área visível
+- Dashboard analítico com métricas por filtros
+- Exportação CSV da área visível (todas as feições no enquadramento)
+- Exportação espacial em GeoJSON da área visível
+- Regras de visualização por zoom para camadas densas
+
+## Como executar localmente
+Como o projeto lê arquivos GeoJSON locais via `fetch`, rode com servidor HTTP simples:
+
+```bash
+python3 -m http.server 8000
+```
+
+Depois acesse: `http://localhost:8000`
 
 ## Observação
 Este é um protótipo demonstrativo sem backend.
