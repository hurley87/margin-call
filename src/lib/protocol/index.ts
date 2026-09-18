export {
  BASE_CHAIN_ID,
  STOCK_DECIMALS,
  USDC_DECIMALS,
  BPS_DENOMINATOR,
  REPAY_BUFFER_BPS,
  ADVERSE_BOUND_BPS,
  SPOT_LEVERAGE,
  LEVERAGE_1_1X,
  LEVERAGE_1_25X,
  LEVERAGE_1_4X,
  LEVERAGE_1_5X,
  DEFAULT_LEVERAGE,
  OPENING_LEVERAGE_PRESETS,
  ORACLE_STATE,
  isSupportedOpeningLeverage,
  isFinancedLeverage,
  type OracleState,
} from "@/lib/protocol/constants";

export {
  erc20Abi,
  marginCallAbi,
  creditPoolAbi,
  oracleAdapterAbi,
} from "@/lib/protocol/abi";

export {
  baseDeployment,
  getAssetById,
  getAssetByName,
  assetIdForName,
  type LaunchAsset,
  type LaunchAssetName,
  type BaseDeployment,
} from "@/lib/protocol/deployment";

export {
  encodeOpenPosition,
  encodeRepay,
  encodeClosePosition,
  encodeApprove,
} from "@/lib/protocol/encode";

export { decodePositionOpenedTokenId } from "@/lib/protocol/decode";

export { repayCeiling, sizePrincipal } from "@/lib/protocol/repay";

export {
  assertBaseChain,
  openReadiness,
  closeReadiness,
  type WriteGate,
  type OpenReadinessInput,
} from "@/lib/protocol/readiness";

export { basescanTxUrl } from "@/lib/protocol/explorer";

export {
  createBasePublicClient,
  getBaseRpcUrl,
} from "@/lib/protocol/public-client";

export {
  parseStockAmount,
  formatStockAmount,
  formatUsdcRaw,
} from "@/lib/protocol/amounts";

export { isTxPending, type TxPhase } from "@/lib/protocol/tx-phase";
