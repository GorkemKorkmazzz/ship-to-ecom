-- ShipToEcom PostgreSQL tabloları. prisma/schema.prisma dosyasından üretilir:
--   DATABASE_URL=postgresql://... node scripts/db.mjs generate
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.postgres.prisma --script
-- Yayında tablolar açılışta otomatik oluşturulur; bu dosya elle kurulum için yedektir.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "plan" TEXT NOT NULL DEFAULT 'baslangic',
    "billingPeriod" TEXT NOT NULL DEFAULT 'aylik',
    "trialEndsAt" TIMESTAMP(3),
    "paidUntil" TIMESTAMP(3),
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "safetyStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lowStockThreshold" DOUBLE PRECISION,
    "criticalStock" DOUBLE PRECISION,
    "priorityStoreId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ikas',
    "storeName" TEXT NOT NULL,
    "externalId" TEXT,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "stockLocationId" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "webhooksActive" BOOLEAN NOT NULL DEFAULT false,
    "lastOrderSyncAt" TIMESTAMP(3),
    "lastCartSyncAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "merchantId" TEXT,
    "priceRuleActive" BOOLEAN NOT NULL DEFAULT false,
    "pricePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceFixed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceRound" TEXT NOT NULL DEFAULT 'none',
    "stockSharePercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sfKey" TEXT,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sharedStock" DOUBLE PRECISION NOT NULL,
    "pendingDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInfo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'kurumsal',
    "name" TEXT NOT NULL,
    "taxNumber" TEXT NOT NULL,
    "taxOffice" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "BillingInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "vat" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'havale',
    "status" TEXT NOT NULL DEFAULT 'bekliyor',
    "billingJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "safetyStock" DOUBLE PRECISION,
    "lowStockThreshold" DOUBLE PRECISION,
    "category" TEXT,
    "brand" TEXT,
    "fields" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "SkuSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Definition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeLabel" TEXT,
    "delta" DOUBLE PRECISION NOT NULL,
    "sharedAfter" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreVariant" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sellPrice" DOUBLE PRECISION,
    "discountPrice" DOUBLE PRECISION,
    "buyPrice" DOUBLE PRECISION,
    "imageId" TEXT,
    "barcode" TEXT,
    "matchSku" TEXT NOT NULL DEFAULT '',
    "lastSeenStock" DOUBLE PRECISION,
    "duplicateSku" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuAlias" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "matchSku" TEXT NOT NULL,

    CONSTRAINT "SkuAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ikasOrderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentStatus" TEXT,
    "packageStatus" TEXT,
    "currency" TEXT NOT NULL,
    "totalFinalPrice" DOUBLE PRECISION NOT NULL,
    "orderedAt" TIMESTAMP(3),
    "shippingMethod" TEXT,
    "packages" TEXT NOT NULL DEFAULT '[]',
    "salesChannel" TEXT,
    "trafficSource" TEXT,
    "referer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "city" TEXT,
    "district" TEXT,
    "couponCode" TEXT,
    "campaigns" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalPrice" DOUBLE PRECISION,
    "shippingTotal" DOUBLE PRECISION,
    "shippingTax" DOUBLE PRECISION,
    "taxTotal" DOUBLE PRECISION,
    "finSyncedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "finalPrice" DOUBLE PRECISION,
    "imageId" TEXT,
    "ikasLineId" TEXT,
    "status" TEXT,
    "listPrice" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "costCurrency" TEXT,
    "costSource" TEXT,
    "costCapturedAt" TIMESTAMP(3),

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbandonedCart" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ikasId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recoveryStatus" TEXT,
    "emailStatus" TEXT,
    "total" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "itemCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "couponCode" TEXT,
    "city" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "linesJson" TEXT NOT NULL DEFAULT '[]',
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbandonedCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL DEFAULT 'info',
    "sku" TEXT,
    "storeLabel" TEXT,
    "message" TEXT NOT NULL,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "actions" TEXT NOT NULL DEFAULT '[]',
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT,
    "timezone" TEXT,
    "managerId" TEXT,
    "remoteStatus" INTEGER,
    "metricsSyncedAt" TIMESTAMP(3),
    "metricsError" TEXT,
    "metricsFrom" TEXT,
    "levelSyncedAt" TIMESTAMP(3),
    "levelError" TEXT,
    "productSyncedAt" TIMESTAMP(3),
    "productError" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteAdAccount" (
    "websiteId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteAdAccount_pkey" PRIMARY KEY ("websiteId","adAccountId")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "objective" TEXT,
    "dailyBudget" DOUBLE PRECISION,
    "lifetimeBudget" DOUBLE PRECISION,
    "budgetLevel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdDailyMetric" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "currency" TEXT,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "purchases" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchaseValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "linkClicks" INTEGER,
    "landingPageViews" DOUBLE PRECISION,
    "viewContent" DOUBLE PRECISION,
    "addToCart" DOUBLE PRECISION,
    "initiateCheckout" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsProperty" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountName" TEXT,
    "currency" TEXT,
    "timezone" TEXT,
    "websiteId" TEXT,
    "metricsSyncedAt" TIMESTAMP(3),
    "metricsError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "users" INTEGER NOT NULL DEFAULT 0,
    "keyEvents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchases" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreModule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "draft" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleStat" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ModuleStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "contactHash" TEXT,
    "contactEnc" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "ipHash" TEXT NOT NULL,
    "cookieId" TEXT NOT NULL,
    "prizeKey" TEXT NOT NULL,
    "prizeLabel" TEXT NOT NULL,
    "prizeType" TEXT NOT NULL,
    "code" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WheelEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMeta" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSet" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "dailyBudget" DOUBLE PRECISION,
    "lifetimeBudget" DOUBLE PRECISION,
    "optimization" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "adType" TEXT,
    "creativeId" TEXT,
    "creativeType" TEXT,
    "objectType" TEXT,
    "thumbnailUrl" TEXT,
    "imageUrl" TEXT,
    "videoId" TEXT,
    "assets" TEXT,
    "creativeSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdLevelDaily" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "adSetId" TEXT,
    "adId" TEXT,
    "date" TEXT NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "purchases" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchaseValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdLevelDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdReachPeriod" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "reach" INTEGER,
    "frequency" DOUBLE PRECISION,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdReachPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsCampaignDaily" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "googleAdsCampaign" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "itemViews" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "addToCarts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "checkouts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchases" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsCampaignDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdProductDaily" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "productTitle" TEXT,
    "spend" DOUBLE PRECISION,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" DOUBLE PRECISION,
    "conversionValue" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdProductDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCostHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productId" TEXT,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "purchaseCost" DOUBLE PRECISION,
    "productionCost" DOUBLE PRECISION,
    "packagingCost" DOUBLE PRECISION,
    "labelCost" DOUBLE PRECISION,
    "otherCost" DOUBLE PRECISION,
    "currency" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT,
    "orderId" TEXT,
    "settlementId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "taxAmount" DOUBLE PRECISION,
    "taxRate" DOUBLE PRECISION,
    "taxInclusive" BOOLEAN,
    "fxRate" DOUBLE PRECISION,
    "fxCurrency" TEXT,
    "fxDate" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "note" TEXT,
    "allocationMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceSettlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "grossSales" DOUBLE PRECISION,
    "commission" DOUBLE PRECISION,
    "shippingDeduction" DOUBLE PRECISION,
    "serviceFee" DOUBLE PRECISION,
    "returnDeduction" DOUBLE PRECISION,
    "otherDeduction" DOUBLE PRECISION,
    "netPayout" DOUBLE PRECISION,
    "payoutDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnFinancial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT,
    "orderId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "taxAmount" DOUBLE PRECISION,
    "includesShipping" BOOLEAN,
    "reason" TEXT,
    "refundedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnFinancial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAllocation" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "taxAmount" DOUBLE PRECISION,
    "taxRate" DOUBLE PRECISION,
    "taxInclusive" BOOLEAN,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Store_sfKey_key" ON "Store"("sfKey");

-- CreateIndex
CREATE UNIQUE INDEX "Store_userId_storeName_key" ON "Store"("userId", "storeName");

-- CreateIndex
CREATE UNIQUE INDEX "SharedItem_userId_sku_key" ON "SharedItem"("userId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInfo_userId_key" ON "BillingInfo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "SkuSetting_userId_category_idx" ON "SkuSetting"("userId", "category");

-- CreateIndex
CREATE INDEX "SkuSetting_userId_brand_idx" ON "SkuSetting"("userId", "brand");

-- CreateIndex
CREATE UNIQUE INDEX "SkuSetting_userId_sku_key" ON "SkuSetting"("userId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Definition_userId_kind_name_key" ON "Definition"("userId", "kind", "name");

-- CreateIndex
CREATE INDEX "StockMovement_userId_sku_createdAt_idx" ON "StockMovement"("userId", "sku", "createdAt");

-- CreateIndex
CREATE INDEX "StoreVariant_storeId_sku_idx" ON "StoreVariant"("storeId", "sku");

-- CreateIndex
CREATE INDEX "StoreVariant_storeId_matchSku_idx" ON "StoreVariant"("storeId", "matchSku");

-- CreateIndex
CREATE UNIQUE INDEX "StoreVariant_storeId_variantId_key" ON "StoreVariant"("storeId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SkuAlias_storeId_sku_key" ON "SkuAlias"("storeId", "sku");

-- CreateIndex
CREATE INDEX "Order_storeId_orderedAt_idx" ON "Order"("storeId", "orderedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_ikasOrderId_key" ON "Order"("storeId", "ikasOrderId");

-- CreateIndex
CREATE INDEX "AbandonedCart_storeId_lastActivityAt_idx" ON "AbandonedCart"("storeId", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCart_storeId_ikasId_key" ON "AbandonedCart"("storeId", "ikasId");

-- CreateIndex
CREATE INDEX "SyncLog_userId_createdAt_idx" ON "SyncLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRule_userId_active_idx" ON "AutomationRule"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_ruleId_orderId_key" ON "AutomationRun"("ruleId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Website_storeId_key" ON "Website"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Website_userId_domain_key" ON "Website"("userId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "AdIntegration_userId_provider_externalUserId_key" ON "AdIntegration"("userId", "provider", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_integrationId_externalId_key" ON "AdAccount"("integrationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_adAccountId_externalId_key" ON "AdCampaign"("adAccountId", "externalId");

-- CreateIndex
CREATE INDEX "AdDailyMetric_adAccountId_date_idx" ON "AdDailyMetric"("adAccountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdDailyMetric_campaignId_date_key" ON "AdDailyMetric"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsProperty_websiteId_key" ON "AnalyticsProperty"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsProperty_integrationId_propertyId_key" ON "AnalyticsProperty"("integrationId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDaily_propertyId_date_channel_key" ON "AnalyticsDaily"("propertyId", "date", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "StoreModule_storeId_moduleKey_key" ON "StoreModule"("storeId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleStat_storeId_moduleKey_day_type_key" ON "ModuleStat"("storeId", "moduleKey", "day", "type");

-- CreateIndex
CREATE UNIQUE INDEX "WheelEntry_code_key" ON "WheelEntry"("code");

-- CreateIndex
CREATE INDEX "WheelEntry_storeId_createdAt_idx" ON "WheelEntry"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "WheelEntry_storeId_contactHash_idx" ON "WheelEntry"("storeId", "contactHash");

-- CreateIndex
CREATE INDEX "WheelEntry_storeId_ipHash_idx" ON "WheelEntry"("storeId", "ipHash");

-- CreateIndex
CREATE INDEX "WheelEntry_storeId_cookieId_idx" ON "WheelEntry"("storeId", "cookieId");

-- CreateIndex
CREATE INDEX "ProductMeta_storeId_slug_idx" ON "ProductMeta"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMeta_storeId_productId_key" ON "ProductMeta"("storeId", "productId");

-- CreateIndex
CREATE INDEX "AdSet_campaignId_idx" ON "AdSet"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSet_adAccountId_externalId_key" ON "AdSet"("adAccountId", "externalId");

-- CreateIndex
CREATE INDEX "Ad_adSetId_idx" ON "Ad"("adSetId");

-- CreateIndex
CREATE INDEX "Ad_campaignId_idx" ON "Ad"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_adAccountId_externalId_key" ON "Ad"("adAccountId", "externalId");

-- CreateIndex
CREATE INDEX "AdLevelDaily_adAccountId_date_idx" ON "AdLevelDaily"("adAccountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdLevelDaily_level_entityId_date_key" ON "AdLevelDaily"("level", "entityId", "date");

-- CreateIndex
CREATE INDEX "AdReachPeriod_adAccountId_idx" ON "AdReachPeriod"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AdReachPeriod_level_entityId_fromDate_toDate_key" ON "AdReachPeriod"("level", "entityId", "fromDate", "toDate");

-- CreateIndex
CREATE INDEX "AnalyticsCampaignDaily_propertyId_date_idx" ON "AnalyticsCampaignDaily"("propertyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsCampaignDaily_propertyId_date_source_medium_campai_key" ON "AnalyticsCampaignDaily"("propertyId", "date", "source", "medium", "campaign", "googleAdsCampaign");

-- CreateIndex
CREATE INDEX "AdProductDaily_adAccountId_date_idx" ON "AdProductDaily"("adAccountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdProductDaily_campaignId_date_productKey_key" ON "AdProductDaily"("campaignId", "date", "productKey");

-- CreateIndex
CREATE INDEX "ProductCostHistory_storeId_sku_validFrom_idx" ON "ProductCostHistory"("storeId", "sku", "validFrom");

-- CreateIndex
CREATE INDEX "ProductCostHistory_userId_idx" ON "ProductCostHistory"("userId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_userId_occurredAt_idx" ON "FinancialTransaction"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_orderId_idx" ON "FinancialTransaction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_userId_source_externalId_key" ON "FinancialTransaction"("userId", "source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSettlement_userId_source_externalId_key" ON "MarketplaceSettlement"("userId", "source", "externalId");

-- CreateIndex
CREATE INDEX "ReturnFinancial_orderId_idx" ON "ReturnFinancial"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnFinancial_userId_source_externalId_key" ON "ReturnFinancial"("userId", "source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CostAllocation_transactionId_sku_key" ON "CostAllocation"("transactionId", "sku");

-- CreateIndex
CREATE INDEX "Expense_userId_periodStart_idx" ON "Expense"("userId", "periodStart");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedItem" ADD CONSTRAINT "SharedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInfo" ADD CONSTRAINT "BillingInfo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuSetting" ADD CONSTRAINT "SkuSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Definition" ADD CONSTRAINT "Definition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreVariant" ADD CONSTRAINT "StoreVariant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuAlias" ADD CONSTRAINT "SkuAlias_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbandonedCart" ADD CONSTRAINT "AbandonedCart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdIntegration" ADD CONSTRAINT "AdIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AdIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteAdAccount" ADD CONSTRAINT "WebsiteAdAccount_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteAdAccount" ADD CONSTRAINT "WebsiteAdAccount_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDailyMetric" ADD CONSTRAINT "AdDailyMetric_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDailyMetric" ADD CONSTRAINT "AdDailyMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsProperty" ADD CONSTRAINT "AnalyticsProperty_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AdIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsProperty" ADD CONSTRAINT "AnalyticsProperty_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDaily" ADD CONSTRAINT "AnalyticsDaily_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "AnalyticsProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreModule" ADD CONSTRAINT "StoreModule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleStat" ADD CONSTRAINT "ModuleStat_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelEntry" ADD CONSTRAINT "WheelEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMeta" ADD CONSTRAINT "ProductMeta_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSet" ADD CONSTRAINT "AdSet_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSet" ADD CONSTRAINT "AdSet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "AdSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdLevelDaily" ADD CONSTRAINT "AdLevelDaily_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdLevelDaily" ADD CONSTRAINT "AdLevelDaily_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "AdSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdLevelDaily" ADD CONSTRAINT "AdLevelDaily_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdReachPeriod" ADD CONSTRAINT "AdReachPeriod_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsCampaignDaily" ADD CONSTRAINT "AnalyticsCampaignDaily_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "AnalyticsProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdProductDaily" ADD CONSTRAINT "AdProductDaily_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdProductDaily" ADD CONSTRAINT "AdProductDaily_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostHistory" ADD CONSTRAINT "ProductCostHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostHistory" ADD CONSTRAINT "ProductCostHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "MarketplaceSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSettlement" ADD CONSTRAINT "MarketplaceSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnFinancial" ADD CONSTRAINT "ReturnFinancial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnFinancial" ADD CONSTRAINT "ReturnFinancial_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

