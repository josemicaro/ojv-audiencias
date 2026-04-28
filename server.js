const express = require('express');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

function callAnthropic(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Respuesta inválida de la API')); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

app.post('/api/analyze', async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API key no configurada en el servidor.' });
  try {
    const { base64 } = req.body;
    const prompt = `Eres un asistente especializado en documentos judiciales chilenos de la Oficina Judicial Virtual (OJV).
Analiza este PDF y extrae TODAS las audiencias que aparecen.

Para cada audiencia extrae (null si no está disponible):
- fecha: DD/MM/YYYY
- hora: HH:MM
- rit: número RIT o RUC completo
- rol_propiedad: rol de avalúo o rol de la propiedad (ej: "123-45", "Rol 567-8")
- tipo: tipo de audiencia
- tribunal: nombre del tribunal o sala
- propiedad: dirección o descripción del bien raíz/propiedad
- ubicacion: ciudad, comuna o localización geográfica
- demandante: nombre completo del demandante o requirente
- demandado: nombre completo del demandado o requerido
- estado: estado de la audiencia (Programada, Suspendida, Realizada, etc.)
- materia: materia del juicio (ej: "Precario", "Arriendo", "Comodato", etc.)
- observaciones: notas adicionales importantes

Responde SOLO con JSON válido, sin texto ni markdown:
{
  "total": número,
  "fecha_documento": "...",
  "tribunal_principal": "...",
  "audiencias": [ { "fecha":"...", "hora":"...", "rit":"...", "rol_propiedad":"...", "tipo":"...", "tribunal":"...", "propiedad":"...", "ubicacion":"...", "demandante":"...", "demandado":"...", "estado":"...", "materia":"...", "observaciones":"..." } ]
}`;

    const data = await callAnthropic({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: prompt }
        ]
      }]
    });

    if (data.error) return res.status(400).json({ error: data.error.message });
    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(clean));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/procesal', async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API key no configurada en el servidor.' });
  try {
    const { audiencia } = req.body;
    const prompt = `Eres un abogado chileno experto en derecho procesal civil y litigación inmobiliaria.

Basándote en los siguientes datos de una audiencia judicial, redacta un resumen claro del estado procesal de la causa.
Explica: en qué etapa del proceso se encuentra, qué significa la audiencia programada, cuáles son los próximos pasos habituales y qué importancia tiene para las partes.
Si hay propiedad o inmueble involucrado, explica su relevancia en el contexto del juicio.
Escribe en español, de forma clara y directa, en 3-5 párrafos cortos.
Usa <strong> para resaltar términos legales importantes.

Datos de la audiencia:
${JSON.stringify(audiencia, null, 2)}`;

    const data = await callAnthropic({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    if (data.error) return res.status(400).json({ error: data.error.message });
    const text = (data.content || []).map(b => b.text || '').join('').trim();
    res.json({ resumen: text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Servidor OJV corriendo en puerto ${PORT}`));
