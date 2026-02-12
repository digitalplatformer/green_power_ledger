import { Pool } from 'pg';
import { handleMint } from './handlers/mint';
import { handleTransfer } from './handlers/transfer';
import { handleBurn } from './handlers/burn';
import {
  handleGetOperationStatus,
  handleGetOperationStatusLightweight
} from './handlers/operations';
import { handleCreateWallet, handleGetWallet, handleFundWallet } from './handlers/wallets';

/**
 * API Router
 * Routes requests to the appropriate handlers
 */
export async function router(req: Request, pool: Pool): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS headers (as needed)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // OPTIONS request (CORS preflight)
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    // Routing
    let response: Response;

    // POST /api/operations/mint
    if (method === 'POST' && path === '/api/operations/mint') {
      response = await handleMint(req, pool);
    }
    // POST /api/operations/transfer
    else if (method === 'POST' && path === '/api/operations/transfer') {
      response = await handleTransfer(req, pool);
    }
    // POST /api/operations/burn
    else if (method === 'POST' && path === '/api/operations/burn') {
      response = await handleBurn(req, pool);
    }
    // GET /api/operations/:operationId
    else if (method === 'GET' && path.startsWith('/api/operations/')) {
      const operationId = path.split('/').pop();
      if (!operationId) {
        response = new Response(
          JSON.stringify({ error: 'Missing operation ID' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      } else if (url.searchParams.get('status') === 'true') {
        response = await handleGetOperationStatusLightweight(operationId, pool);
      } else {
        response = await handleGetOperationStatus(operationId, pool);
      }
    }
    // POST /api/wallets
    else if (method === 'POST' && path === '/api/wallets') {
      response = await handleCreateWallet(req, pool);
    }
    // POST /api/wallets/:walletId/fund
    else if (method === 'POST' && path.match(/^\/api\/wallets\/[^\/]+\/fund$/)) {
      const pathParts = path.split('/');
      const walletId = pathParts[3]; // /api/wallets/{walletId}/fund
      if (!walletId) {
        response = new Response(
          JSON.stringify({ error: 'Missing wallet ID' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        response = await handleFundWallet(walletId, pool);
      }
    }
    // GET /api/wallets/:walletId
    else if (method === 'GET' && path.startsWith('/api/wallets/')) {
      const walletId = path.split('/').pop();
      if (!walletId) {
        response = new Response(
          JSON.stringify({ error: 'Missing wallet ID' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        response = await handleGetWallet(walletId, pool);
      }
    }
    // Health check
    else if (method === 'GET' && path === '/health') {
      response = new Response(
        JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // 404 Not Found
    else {
      response = new Response(
        JSON.stringify({ error: 'Not Found', path, method }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Add CORS headers
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

  } catch (error: any) {
    console.error('Router error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}
