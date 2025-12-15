const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const pLimit = require('p-limit').default; // Gerenciador de concorrência
const crypto = require('crypto'); // gerador de números aleatórios


const MAX_CONCURRENT_DOWNLOADS = 4; // Limite de requisições de rede simultâneas. Valor seguro contra rate limiting.
const MAX_CONCURRENT_READS = 20;    // Limite de operações de leitura de arquivo simultâneas.

// ----------------------------------------------------------------------------------
// --- FUNÇÕES DE NÍVEL INFERIOR (HELPERS) ---
// ----------------------------------------------------------------------------------

/**
 * Lê e analisa um único arquivo JSON.
 * @param {string} filePath - O caminho completo para o arquivo JSON.
 */
async function readJsonFile(filePath) {
    try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`  - ERRO: Falha ao ler ou analisar o arquivo JSON: ${filePath}. ${error.message}`);
        return null;
    }
}

/**
 * Faz o download de uma única imagem. Lança um erro se o status não for 2xx.
 * @param {string} url - A URL da imagem.
 * @param {string} filepath - O caminho de saída para a imagem.
 */
async function downloadImage(url, filepath) {
    // 1. Cria um caminho temporário único no mesmo diretório
    const tempFilePath = `${filepath}.tmp_${crypto.randomBytes(8).toString('hex')}`;
    
    let writer;    
    let statusCode;

    try {
        writer = fsSync.createWriteStream(tempFilePath);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            headers: {                
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/47.0',
            }
        });

        statusCode = response.status; // Armazena o código de status

        // Pipe do stream de resposta para o arquivo
        response.data.pipe(writer);

        // Promessa que resolve no fim do download ou rejeita em caso de erro
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', (err) => {
                writer.close();
                reject(err);
            });
        });

        // 2. Renomeia o arquivo temporário para o caminho final SOMENTE se o download foi um sucesso
        await fs.rename(tempFilePath, filepath);
        
        return statusCode; // Retorna o código de status para o log

    } catch (error) {
        // 3. Em caso de falha, garante que o escritor seja destruído e o tempFile removido
       if (writer && writer.destroy) {
            writer.destroy();
        }
        // Tenta remover o arquivo temporário, ignorando erros se ele não existir
        try {
            if (fsSync.existsSync(tempFilePath)) {
                await fs.unlink(tempFilePath);
            }
        } catch (cleanupError) {
            console.warn(`Aviso de limpeza: Não foi possível remover o arquivo temporário ${tempFilePath}: ${cleanupError.message}`);
        }
        // Lança o erro para ser capturado pela lógica de retentativa
        throw error;
    }
}

/**
 * Tenta fazer o download com retentativas e lida com erros permanentes (404, 403).
 * @param {string} url - A URL da imagem.
 * @param {string} filePath - O caminho de saída para a imagem.
 * @param {number} maxRetries - O número máximo de tentativas (além da primeira).
 * @returns {string} O resultado final ('SUCCESS', 'ERROR:404', etc.).
 */
async function attemptDownloadWithRetries(url, filePath, maxRetries = 3) {
    const filename = path.basename(filePath);

    for (let i = 0; i < maxRetries; i++) {
        try {
            const finalStatusCode = await downloadImage(url, filePath);
            return `SUCCESS:${finalStatusCode}`;
        } catch (error) {
            const statusCode = error.response ? error.response.status : null;

            // 1. ERROS PERMANENTES (404, 403): Não retentar.
            if (statusCode === 404) {
                return 'ERROR:404 (Not Found)';
            }
            if (statusCode === 403) {
                return 'ERROR:403 (Forbidden)';
            }

            // 2. ERROS RECUPERÁVEIS (Rede, Timeout, 5xx)
            if (i < maxRetries - 1) {
                // Cálculo de delay com backoff exponencial (1s, 2s, 4s...)
                const delay = 1000 * Math.pow(2, i); 
                console.warn(`  - AVISO: Falha no download de ${filename}. Retentando em ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // 3. ERRO FINAL: Desistindo.
                return `ERROR:Final (${statusCode || 'Network/Timeout'})`;
            }
        }
    }
    // Caso de segurança (nunca deve ser alcançado)
    return 'ERROR:Unknown';
}


// ----------------------------------------------------------------------------------
// --- FUNÇÃO PRINCIPAL ---
// ----------------------------------------------------------------------------------

/**
 * Lê arquivos JSON, extrai URLs, verifica existência, faz download concorrente com retentativas e gera um log.
 * @param {string} sourceDir - A pasta contendo arquivos JSON.
 * @param {string} outputDir - A pasta onde as imagens serão baixadas.
 * @param {string} nameProp - A propriedade JSON usada para o nome do arquivo de saída (já inclui a extensão).
 */
async function downloadImages(sourceDir, outputDir, nameProp) {
    const now = new Date();    
    // Formato: YYYYMMDD-HHMMSS (Exemplo: 20251215-013025)
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-` +
                      `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    
    // Nome do arquivo de log, garantindo unicidade.
    const logFileName = `download_log_${timestamp}.txt`;

    console.log(`\nIniciando processo de download de imagens em três fases.`);
    console.log(`Timestamp do Log: ${timestamp}`);
    console.log(`Fonte JSON: ${sourceDir}`);
    console.log(`Saída de Imagens: ${outputDir}`);

    // Lista para armazenar o resultado de CADA arquivo (para o log final)
    const downloadResults = [];
    

    try {
        // --- PREPARAÇÃO E FASE 1: LEITURA, FILTRAGEM E COLETA (I/O PARALELO) ---
        console.log('\n--- FASE 1: Lendo JSONs, Verificando Existência ---');

        // 1. Garante que o diretório de saída existe
        await fs.mkdir(outputDir, { recursive: true });

        // 2. Cria um Set de arquivos existentes no diretório de saída (para verificação rápida)
        const outputEntries = await fs.readdir(outputDir, { withFileTypes: true });
        const existingFilenames = new Set(outputEntries.filter(d => d.isFile()).map(d => d.name));
        console.log(`Arquivos existentes encontrados: ${existingFilenames.size}`);

        // 3. Lê todos os arquivos JSON de forma PARALELA
        const sourceEntries = await fs.readdir(sourceDir, { withFileTypes: true });
        const jsonFiles = sourceEntries.filter(d => d.isFile() && d.name.endsWith('.json'));
        
        const readLimit = pLimit(MAX_CONCURRENT_READS); // Limite de I/O de disco
        const readPromises = jsonFiles.map(entry => {
            const sourcePath = path.join(sourceDir, entry.name);
            return readLimit(() => readJsonFile(sourcePath));
        });

        // Espera todas as leituras terminarem
        const parsedJsonData = await Promise.all(readPromises);
        console.log(`Arquivos JSON lidos e analisados: ${jsonFiles.length}`);

        // 4. Cria a lista final de tarefas de download
        const downloadTasks = [];

        for (const data of parsedJsonData) {
            if (!data) continue; // Pula se houve erro na leitura/parsing

            const imageUrl = data.url; 
            const outputFilename = data[nameProp]; 

            if (!imageUrl || !outputFilename) {
                // Se faltar URL ou nome, registra erro no log e pula
                downloadResults.push({ url: imageUrl || 'N/A', filename: outputFilename || 'N/A', result: 'ERROR:MissingData' });
                continue;
            }

            // --- VERIFICAÇÃO DE EXISTÊNCIA (SKIPPING) ---
            if (existingFilenames.has(outputFilename)) {
                downloadResults.push({ url: imageUrl, filename: outputFilename, result: 'SKIPPED' });
                console.log(`  - PULO: Arquivo já existe: ${outputFilename}`);
                continue;
            }

            // Adiciona a tarefa de download à lista de execução
            downloadTasks.push({ url: imageUrl, filename: outputFilename });
        }
        
        console.log(`Total de tarefas de download necessárias: ${downloadTasks.length}`);

        // --- FASE 2: EXECUÇÃO CONCORRENTE COM RETENTATIVAS ---
        console.log('\n--- FASE 2: Iniciando Downloads Concorrentes ---');

        if (downloadTasks.length > 0) {
            const downloadLimit = pLimit(MAX_CONCURRENT_DOWNLOADS); // Limite de requisições de rede
            
            const downloadPromises = downloadTasks.map(task => {
                const outputFilePath = path.join(outputDir, task.filename);
                
                // Wrap a função de retentativa no limitador
                return downloadLimit(async () => {
                    const result = await attemptDownloadWithRetries(task.url, outputFilePath, 3);
                    downloadResults.push({ url: task.url, filename: task.filename, result });
                    if (result === 'SUCCESS') {
                        console.log(`  - SUCESSO: ${task.filename}`);
                    }
                    return result;
                });
            });

            // Espera todos os downloads terminarem
            await Promise.all(downloadPromises);
        }

        console.log(`\nProcesso de download concluído. Total de registros: ${downloadResults.length}`);


        // --- FASE 3: GERAÇÃO DO LOG FINAL ---
        console.log(`--- FASE 3: Gerando Log de Resultados (${logFileName}) ---`);
        
        const logFilePath = path.join(outputDir, logFileName);
        
        // Formato: URL | FILENAME | RESULT
        const logHeader = `URL | FILENAME | RESULT\n${'-'.repeat(80)}\n`;
        const logContent = logHeader + downloadResults
            .map(r => `${r.url} | ${r.filename} | ${r.result}`)
            .join('\n');

        await fs.writeFile(logFilePath, logContent, 'utf8');
        console.log(`Log de resultados escrito em: ${logFilePath}`);
        
    } catch (error) {
        console.error(`\nErro fatal durante o processamento de imagens:`, error.message);
        throw error;
    }
}

module.exports = {
    downloadImages
};