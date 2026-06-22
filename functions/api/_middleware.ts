const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequest: PagesFunction = async (context) => {
  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const response = await context.next()
  // Add CORS headers to all responses
  const newResponse = new Response(response.body, response)
  for (const [key, value] of Object.entries(corsHeaders)) {
    newResponse.headers.set(key, value)
  }
  return newResponse
}
