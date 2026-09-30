var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
import { createHash } from "node:crypto";
var PASSWORD_ITERATIONS = 5e3;
var READS_PER_PAGE = 6;
function hashPassword(password, salt, iterations) {
  let value = salt + ":" + password;
  for (let i = 0; i < iterations; i++) {
    value = createHash("sha256").update(value, "utf8").digest("hex");
  }
  return value;
}
__name(hashPassword, "hashPassword");
async function readOnce(env, path) {
  const started = Date.now();
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    headers: {
      "apikey": env.SUPABASE_KEY,
      "Authorization": "Bearer " + env.SUPABASE_KEY,
      "Accept": "application/json",
      "Prefer": "count=exact"
    }
  });
  const body = await response.text();
  return {
    ms: Date.now() - started,
    status: response.status,
    bytes: body.length,
    rows: response.headers.get("content-range") || ""
  };
}
__name(readOnce, "readOnce");
function refuseUnlessAllowed(request, env) {
  const expected = env.PROOF_TOKEN || "";
  if (!expected) {
    return new Response("\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E23\u0E2B\u0E31\u0E2A\u0E25\u0E31\u0E1A\u0E02\u0E2D\u0E07\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E27\u0E31\u0E14 \u2014 \u0E1B\u0E34\u0E14\u0E44\u0E27\u0E49\u0E01\u0E48\u0E2D\u0E19\n", { status: 503 });
  }
  const url = new URL(request.url);
  const given = request.headers.get("x-proof-token") || url.searchParams.get("t") || "";
  if (given.length !== expected.length) return new Response("\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\n", { status: 403 });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return new Response("\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\n", { status: 403 });
  return null;
}
__name(refuseUnlessAllowed, "refuseUnlessAllowed");
var src_default = {
  async fetch(request, env) {
    const denied = refuseUnlessAllowed(request, env);
    if (denied) return denied;
    const url = new URL(request.url);
    const where = {
      colo: request.cf ? request.cf.colo : "(\u0E44\u0E21\u0E48\u0E23\u0E39\u0E49)",
      country: request.cf ? request.cf.country : "(\u0E44\u0E21\u0E48\u0E23\u0E39\u0E49)",
      city: request.cf ? request.cf.city : "(\u0E44\u0E21\u0E48\u0E23\u0E39\u0E49)"
    };
    if (url.pathname === "/hash") {
      const repeat = Math.min(200, Math.max(1, Number(url.searchParams.get("repeat")) || 1));
      let digest = "";
      for (let r = 0; r < repeat; r++) {
        digest = hashPassword("Ab3!xyzQ", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", PASSWORD_ITERATIONS);
      }
      return Response.json({
        \u0E23\u0E2D\u0E1A\u0E17\u0E35\u0E48\u0E27\u0E19\u0E15\u0E48\u0E2D\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E04\u0E23\u0E31\u0E49\u0E07: PASSWORD_ITERATIONS,
        \u0E15\u0E23\u0E27\u0E08\u0E01\u0E35\u0E48\u0E04\u0E23\u0E31\u0E49\u0E07\u0E43\u0E19\u0E04\u0E33\u0E02\u0E2D\u0E19\u0E35\u0E49: repeat,
        \u0E19\u0E32\u0E2C\u0E34\u0E01\u0E32\u0E43\u0E19\u0E15\u0E31\u0E27_ms: 0,
        \u0E2B\u0E21\u0E32\u0E22\u0E40\u0E2B\u0E15\u0E38: "Date.now() \u0E44\u0E21\u0E48\u0E40\u0E14\u0E34\u0E19\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E04\u0E33\u0E19\u0E27\u0E13 \u0E15\u0E49\u0E2D\u0E07\u0E27\u0E31\u0E14\u0E08\u0E32\u0E01\u0E1D\u0E31\u0E48\u0E07\u0E1C\u0E39\u0E49\u0E40\u0E23\u0E35\u0E22\u0E01",
        // ตรงกับค่าที่วัดในเครื่อง แปลว่า Worker คำนวณได้ค่าเดียวกันจริง
        \u0E04\u0E48\u0E32\u0E17\u0E35\u0E48\u0E44\u0E14\u0E49\u0E02\u0E36\u0E49\u0E19\u0E15\u0E49\u0E19\u0E14\u0E49\u0E27\u0E22: digest.slice(0, 24),
        \u0E23\u0E31\u0E19\u0E17\u0E35\u0E48: where
      }, { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/speed") {
      if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
        return Response.json({
          \u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 SUPABASE_URL \u0E2B\u0E23\u0E37\u0E2D SUPABASE_KEY \u0E43\u0E19\u0E04\u0E27\u0E32\u0E21\u0E25\u0E31\u0E1A\u0E02\u0E2D\u0E07 Worker",
          \u0E23\u0E31\u0E19\u0E17\u0E35\u0E48: where
        }, { status: 500 });
      }
      const table = env.SUPABASE_TABLE || "department_task";
      const path = table + "?select=task_id,wo_id,department,status,visit_start&department=eq.SERVICE&order=wo_id.desc&limit=20";
      const each = [];
      const started = Date.now();
      for (let i = 0; i < READS_PER_PAGE; i++) {
        each.push(await readOnce(env, path));
      }
      const total = Date.now() - started;
      return Response.json({
        \u0E2D\u0E48\u0E32\u0E19\u0E01\u0E35\u0E48\u0E04\u0E23\u0E31\u0E49\u0E07: READS_PER_PAGE,
        \u0E23\u0E27\u0E21_ms: total,
        \u0E40\u0E09\u0E25\u0E35\u0E48\u0E22\u0E15\u0E48\u0E2D\u0E04\u0E23\u0E31\u0E49\u0E07_ms: Math.round(total / READS_PER_PAGE),
        \u0E41\u0E15\u0E48\u0E25\u0E30\u0E04\u0E23\u0E31\u0E49\u0E07: each,
        \u0E02\u0E2D\u0E07\u0E40\u0E14\u0E34\u0E21\u0E27\u0E31\u0E14\u0E44\u0E27\u0E49: { \u0E04\u0E33\u0E02\u0E2D\u0E40\u0E14\u0E35\u0E22\u0E27_ms: "423-485", \u0E2B\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E40\u0E23\u0E35\u0E22\u0E07\u0E01\u0E31\u0E19_ms: 2271 },
        \u0E23\u0E31\u0E19\u0E17\u0E35\u0E48: where
      }, { headers: { "cache-control": "no-store" } });
    }
    return Response.json({
      \u0E19\u0E35\u0E48\u0E04\u0E37\u0E2D\u0E2D\u0E30\u0E44\u0E23: "\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E27\u0E31\u0E14\u0E02\u0E2D\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E35\u0E48 0 \u2014 \u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E22\u0E49\u0E32\u0E22\u0E23\u0E30\u0E1A\u0E1A\u0E21\u0E32 \u0E41\u0E25\u0E30\u0E44\u0E21\u0E48\u0E40\u0E02\u0E35\u0E22\u0E19\u0E2D\u0E30\u0E44\u0E23\u0E25\u0E07\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25",
      \u0E17\u0E32\u0E07\u0E17\u0E35\u0E48\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E2B\u0E49: ["/speed", "/hash"],
      \u0E23\u0E31\u0E19\u0E17\u0E35\u0E48: where
    }, { headers: { "cache-control": "no-store" } });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// .wrangler/tmp/bundle-dYcKyE/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-dYcKyE/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
