# FitDesk Zero-Drift Source Manifest

```text
Phase: 0 — Verbatim Journey, Sitemap, and Asset Traceability
Generated: 2026-07-20
Repository: C:\Users\Lenovo\Dev\axis-erp\FitDesk
Branch: feat/ui-ux-modernization
HEAD: 75e8b2b
Status: FROZEN — these are the binding source versions for the zero-drift implementation contract.
Rule: Any source whose SHA-256 no longer matches this manifest is no longer the frozen source.
      Re-freeze requires product-owner approval and a new manifest revision.
```

---

## 1. Binding source hierarchy (fixed)

1. **Journey Map** — behavior, sequence, states, recovery, consequences, specified product copy.
2. **Sitemap** — routes, aliases, navigation labels, hierarchy, placement, contextual workflow ownership.
3. **Matching asset** — layout, visual composition, responsive treatment, density, spacing, component arrangement, branding.
4. **Existing implementation** — domain behavior and integration contracts only.

Existing UI structure at HEAD `75e8b2b` has **no authority** where it conflicts with sources 1–3. The current UI is rejected as a partial reskin and is not evidence of compliance.

---

## 2. Primary sources (repository, frozen)

| # | Source | Path | Size (bytes) | Modified | SHA-256 (full file) |
|---|--------|------|--------------|----------|---------------------|
| S1 | Journey Map v1.12 | `docs/product/FITDESK_JOURNEY_MAP_V1.md` | 242,548 | 2026-07-19 18:00:13 +0300 | `92357e4f6b156418e248cebd6a21593a3c7e4682693d09446179b915c5d1ab4e` |
| S2 | Application Sitemap v1.1 | `docs/product/FITDESK_APPLICATION_SITEMAP_V1_1.md` | 46,698 | 2026-07-19 18:00:13 +0300 | `131e28e313dc73e429e67b6858d0cb438a3ce338d857ef4451453a76c7f25954` |

### 2.1 Source-body hash verification (PASSED)

Both repo files carry a 2026-07-19 adoption banner above the original document body. Stripping the banner (everything through the first `---` separator and the following blank line) reproduces **exactly** the source-body hashes recorded inside each file's own header:

| Source | Header-claimed source-body SHA-256 | Recomputed body SHA-256 | Verdict |
|--------|-----------------------------------|--------------------------|---------|
| S1 Journey Map | `bd4a6bba039e1331d2cb68a194d5cac8c912e5a6008a3cbd5fe474834910443e` | `bd4a6bba039e1331d2cb68a194d5cac8c912e5a6008a3cbd5fe474834910443e` | MATCH |
| S2 Sitemap | `ebf509e62761e0848cacea1284010ecdf18d794310d3b495dcb2b08cad9269fc` | `ebf509e62761e0848cacea1284010ecdf18d794310d3b495dcb2b08cad9269fc` | MATCH |

Version declarations confirmed inside the bodies:
- S1: `Document: Canonical User Journey Map` / `Version: v1.12` — matches the contract's required canonical content `FITDESK_JOURNEY_MAP_V1 v1.12`.
- S2: `Document: Canonical Application Sitemap` / `Version: v1.1` / `Source: FITDESK_JOURNEY_MAP_V1 v1.12` — matches the contract's required canonical content `FitDesk Application Sitemap v1.1`.

---

## 3. Coordinated product documents (README_FIRST pack, frozen)

Pack index: `C:\Users\Lenovo\Downloads\README_FIRST(1).md` — "FitDesk Documentation Pack v1" (1,706 bytes, 2026-07-18 23:58:11 +0300, SHA-256 `8cff52359f45a7cbe1f69fdf1ac65ab80ed72d4c8205847055a383536467e7e1`). All ten documents it lists are present in the repository at the listed paths:

| # | Document | Path | Size | Modified | SHA-256 |
|---|----------|------|------|----------|---------|
| D1 | Product Requirements Document | `docs/product/FITDESK_PRODUCT_REQUIREMENTS_DOCUMENT_V1.md` | 15,715 | 2026-07-19 18:03:38 | `e041a2793b6db35864258db2d160ed6a55ecf0b105d5b5238420bd2edf41822b` |
| D2 | MVP Scope and Release Boundaries | `docs/product/FITDESK_MVP_SCOPE_AND_RELEASE_BOUNDARIES_V1.md` | 10,369 | 2026-07-19 18:03:38 | `0bda838f3eeb30c6e21590bd72ba3b17afbf3e4041bdbf487b0b343b48094579` |
| D3 | Feature Capability Register | `docs/product/FITDESK_FEATURE_CAPABILITY_REGISTER_V1.md` | 11,628 | 2026-07-19 18:03:38 | `0ffc237e9040a7911531d5cfa11295caf4845691c2be4edf5980bb09cceb90ca` |
| D4 | System Architecture | `docs/architecture/FITDESK_SYSTEM_ARCHITECTURE_V1.md` | 12,701 | 2026-07-19 18:03:38 | `5919b06ae3f6e002686e84b92731099f960575cf5946dfd7b0114a9629b03ef5` |
| D5 | Data Ownership Matrix | `docs/architecture/FITDESK_DATA_OWNERSHIP_MATRIX_V1.md` | 10,181 | 2026-07-19 18:03:38 | `b8a404b56360563c2a2b5cf3cddfdb2052b876b6d1ccaffbade4b0f1a5f50d60` |
| D6 | Client Hub Product Specification | `docs/product/FITDESK_CLIENT_HUB_PRODUCT_SPECIFICATION_V1.md` | 11,718 | 2026-07-19 18:03:38 | `486817c5d4ab8c9cfadcf57fb486b58694b190408d11d3ae07a1d95e3657aa51` |
| D7 | Session Completion Flow Specification | `docs/product/FITDESK_SESSION_COMPLETION_FLOW_SPECIFICATION_V1.md` | 10,179 | 2026-07-19 18:03:38 | `c8638859811bce86b801635d3b7a4270fb296e7d4d66f25da231d1a2d4229549` |
| D8 | Inbox and Communication Specification | `docs/product/FITDESK_INBOX_AND_COMMUNICATION_SPECIFICATION_V1.md` | 11,449 | 2026-07-19 18:03:38 | `f813b763ffd5c4e6a0c26633915f6382f08ea044ce71dc6b788f41b85277d547` |
| D9 | Master Test Strategy | `docs/testing/FITDESK_MASTER_TEST_STRATEGY_V1.md` | 12,032 | 2026-07-19 18:03:38 | `42c16ce8fdc138874162d76d422d59ab491e48da07aab893813de1856714904d` |
| D10 | Repository Audit and Route Reconciliation | `docs/audits/FITDESK_REPOSITORY_AUDIT_AND_ROUTE_RECONCILIATION_V1.md` | 14,103 | 2026-07-19 18:03:38 | `5171772bc7bc0c3f291be3e2187927897bafad131d5a62978804fe9851fbc25e` |

Supporting reality reference (not an authority source): `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md` — present; cited by the adoption banners of S1/S2 as the implementation-reality companion.

---

## 4. Asset archive (frozen)

| Property | Value |
|----------|-------|
| File | `C:\Users\Lenovo\Downloads\fitdesk-product-ui-and-brand-assets.zip` |
| Size | 98,603,404 bytes |
| Modified | 2026-07-19 02:03 +0300 |
| SHA-256 | `29c97ec6eb14c1564358e3fcae318f8095de64b6a95c992949535bec4ee2cb96` |
| Entries | 1 directory (`FitDesk Images/`) + **81 PNG files** (101,790,697 bytes uncompressed) |
| Extraction | Scratchpad audit directory only (session temp). **Not** extracted into any tracked repository path. |

Note: the contract names `fitdesk-product-ui-and-brand-assets.zip` or `fitdesk-product-ui-and-brand-assets(2).zip`. Only the former exists in `C:\Users\Lenovo\Downloads`; it is the frozen archive. No `(2)` variant was found.

### 4.1 PNG inventory (81 files, one row each)

All paths are relative to `FitDesk Images/` inside the archive. Dimensions are `width x height` pixels.

| # | Filename | Dimensions | Bytes | SHA-256 |
|---|----------|------------|-------|---------|
| A01 | fitdesk-brand-identity-logo-guidelines.png | 1536 x 1024 | 1,281,041 | `b926bcafc6f41cb0c9b31a2bedcb291fdd5f3af337c6e0cd7bed5540bda97eee` |
| A02 | fitdesk-design-system-ui-component-library.png | 1448 x 1086 | 1,292,560 | `d04c9e9b6ef817be0c013619fa47e44b581fe1f253c1c1aea6c6a7abfb9444de` |
| A03 | fitdesk-desktop-billing-analytics-dashboard.png | 1448 x 1086 | 1,131,203 | `34313b512a96131abf33147858081b9f9a354e76828be636b7ef4d114ee282c7` |
| A04 | fitdesk-desktop-billing-revenue-dashboard.png | 1536 x 1024 | 1,293,667 | `08fa01935aaf87ae3bda103ff894a8c991f85ad2f200901050d416174ee11252` |
| A05 | fitdesk-desktop-client-hub-profile-dashboard.png | 1536 x 1024 | 1,313,596 | `ef3838042a6fbd040c2c9da74644b307bf9bbcddeb4e6cbf2db794dc9fb996dd` |
| A06 | fitdesk-desktop-client-messaging-inbox.png | 1536 x 1024 | 1,305,018 | `9e3ba91c3e55eab2440ed1ab0d0376a48939e6d638592ec03dc4ed02d832c3b5` |
| A07 | fitdesk-desktop-client-performance-profile.png | 1448 x 1086 | 1,274,867 | `df2472908e005af65b018f9f5bd40fb6a4fd2c9673df8ba5e5afb0103122a8b2` |
| A08 | fitdesk-desktop-client-profile-overview.png | 1536 x 1024 | 1,265,811 | `4dfd6f77aa43f53e676f8f6dd18cf5e01b43f592da42d169b1719bff0f18047a` |
| A09 | fitdesk-desktop-clients-management-table.png | 1448 x 1086 | 1,129,295 | `8a925e47325e925f00b3a6a4f9d4e26928ade0d660a9ff0dbae574bb32cc5a3a` |
| A10 | fitdesk-desktop-dashboard-business-overview.png | 1448 x 1086 | 1,232,038 | `c19a562d1d3573a103bc6215528a4ce538122bd7e3bebfe0f98626a6934dd511` |
| A11 | fitdesk-desktop-dashboard-command-center.png | 1536 x 1024 | 1,293,564 | `cfe59d3cb4ce80467d94bd1554cd175952b734e7b852ad90aa128cd7ec940e3f` |
| A12 | fitdesk-desktop-messaging-inbox-conversation.png | 1536 x 1024 | 1,300,538 | `d572d5bf14293b21cf63ca8fb34184b4106c3e1a55f15593790dc3b5c5893e8c` |
| A13 | fitdesk-desktop-messaging-inbox-dashboard.png | 1448 x 1086 | 1,145,192 | `46ff2c3851af93aac0bf5de15953f4fd0c2232e03a74d473ed65cf6c2cefd96c` |
| A14 | fitdesk-desktop-onboarding-billing-communication.png | 1448 x 1086 | 1,244,564 | `fbd01f52148533c11c59e0cdafd43783f5f3a4cc296fa8d1aa81504b9182ab87` |
| A15 | fitdesk-desktop-onboarding-business-profile.png | 1448 x 1086 | 1,095,074 | `77e64f08c8bbddae6ccf989d5862105669f6980758209169ba9ecdfde02b5322` |
| A16 | fitdesk-desktop-onboarding-flow-overview.png | 1448 x 1086 | 1,287,983 | `906be228e377a947eb0c2ccce5b2f8d606d08f24dc975ba63f1fc5dc0c2cff39` |
| A17 | fitdesk-desktop-onboarding-review-and-start.png | 1448 x 1086 | 1,232,892 | `f33896f38b40ceace641947b526f062904637de4c69a9d96d01d421dc2510b81` |
| A18 | fitdesk-desktop-onboarding-welcome-screen.png | 1448 x 1086 | 1,291,575 | `11c03aa44269c6e41fa86b1e895ad9302e84b3760830931a99c4f6eb880d500f` |
| A19 | fitdesk-desktop-onboarding-working-hours.png | 1448 x 1086 | 1,174,679 | `6ee2299b00955dd5258ae7d31364b1c56b7c36619cad094d0a5a79c8339d0f15` |
| A20 | fitdesk-desktop-provisioning-action-required.png | 1448 x 1086 | 1,409,763 | `2ebed916cdf27e12375bcc4366ce1c4532a877598202de5c7eb171dbeb3a6f32` |
| A21 | fitdesk-desktop-provisioning-failed.png | 1448 x 1086 | 1,173,160 | `a190a319a0c15085cdfe7fd2569748d1de271c24127fde0ce7144bb7c985a99b` |
| A22 | fitdesk-desktop-provisioning-in-progress.png | 1448 x 1086 | 1,478,893 | `78e1e4e2a48cd18db6966f2815722b88673c31cfdeff7fa1bc7909ea8d4bddfc` |
| A23 | fitdesk-desktop-provisioning-journey-states.png | 1448 x 1086 | 1,405,389 | `06326273e496b7d931f4d4622a00dd93a42fd1433cb95b839580c89395202f66` |
| A24 | fitdesk-desktop-provisioning-started-and-queue.png | 1672 x 941 | 1,172,458 | `03bc337ce0359090760bfddd321722d57060b8a66869f60e4cda86c801aeb4ec` |
| A25 | fitdesk-desktop-schedule-calendar-and-agenda.png | 1536 x 1024 | 1,351,000 | `11a94eac61c563211de4f223002b26b26fb3a37767e99c5e7e2080f613657f6c` |
| A26 | fitdesk-desktop-schedule-calendar-dashboard.png | 1448 x 1086 | 1,364,550 | `a89dc30e2206ea99cba82860ba6d23616f17bf592fb4ebac7e1c3529e32e621f` |
| A27 | fitdesk-desktop-schedule-session-list.png | 1536 x 1024 | 1,267,344 | `a3084e7a82f88b92b79e42b0002fd0a2b853f2e74ab165f1f7b7516badca5f87` |
| A28 | fitdesk-desktop-session-booking-availability-flow.png | 1536 x 1024 | 1,356,111 | `d3ef1ef483d861cf5db0a9852a71ef1bc19c2bc46073016a9d5bc453667b0079` |
| A29 | fitdesk-desktop-settings-management.png | 1448 x 1086 | 1,109,954 | `a199c59f8687e5773bacdaa713750fff2131886eaa81f67158e5cb5f29780269` |
| A30 | fitdesk-desktop-sign-in-fitness-photo-layout.png | 1536 x 1024 | 1,489,016 | `a7109a0c706007764167d60f0214d1f192c4b254fa44bf037b813d49aa734f6c` |
| A31 | fitdesk-desktop-sign-in-platform-benefits.png | 1448 x 1086 | 1,173,026 | `b1acac7cb630e697423e3aef28c5e8740585fc7123499a19614538e2bea70ab2` |
| A32 | fitdesk-desktop-sign-in-product-preview.png | 1055 x 1491 | 1,294,407 | `d7abf6b8a70a8b4148a2e8be65fe609bc3938a62bb0dd742e3020283021487cd` |
| A33 | fitdesk-desktop-universal-search-overlay.png | 1448 x 1086 | 1,009,548 | `e27bc5549972a3bd8f992bd7d28ed1c20d4962aa27422a51da485fb106075abe` |
| A34 | fitdesk-desktop-workspace-ready-success.png | 1448 x 1086 | 1,153,471 | `64f813e18017006849b10f93b0c990a5333c2d5d2a4d57d7a73c05d10dc89a29` |
| A35 | fitdesk-marketing-desktop-homepage-full.png | 1448 x 1086 | 1,278,655 | `5a09ee6b239ff14aa08c312c50cb0c593c4166cd974d7882779b572a71e594fe` |
| A36 | fitdesk-marketing-homepage-full-overview.png | 1055 x 1491 | 1,453,037 | `19ff9592b6fa2c821daa68a6a5cdad1cc40edddf1fe35c9be4b737d180b2e5db` |
| A37 | fitdesk-marketing-landing-page-trainer-platform.png | 1536 x 1024 | 1,456,559 | `fe3ab54b6af4219832a396dfb32f85b53bfe7d1032d4d2fea73e67b104de3ab6` |
| A38 | fitdesk-mobile-billing-dashboard.png | 941 x 1672 | 1,128,280 | `5f50c9319bef5a49c97ac51f442e58a0b03570f02f74efd50dc26dbbfa7eb347` |
| A39 | fitdesk-mobile-billing-revenue-overview.png | 941 x 1672 | 1,102,221 | `18e485daacca7157dc7564d51977c233fa3c5af13b014c25fa0591b1cf2fd98f` |
| A40 | fitdesk-mobile-client-hub-profile.png | 941 x 1672 | 1,239,472 | `20cd2ee93b0394714686671910d17775e7ece511068c67daa544541e98f973a6` |
| A41 | fitdesk-mobile-client-profile-dashboard.png | 941 x 1672 | 1,211,342 | `b7d1f1f4f3ccde63b1c32e92e5b3871f6b7c7f6d10b803a6c1b3065c52cf2c92` |
| A42 | fitdesk-mobile-client-provisioning-journey.png | 1448 x 1086 | 1,313,161 | `09818d06166d6d3e52fae8fcc5ff5b529eb23d15ea7c971b7df9689f53f03447` |
| A43 | fitdesk-mobile-clients-list-alternate.png | 941 x 1672 | 1,302,063 | `708bd08a407b314d0beab4e3ed5f077205393d429508e74c2aa5d3143c20e01c` |
| A44 | fitdesk-mobile-clients-list.png | 941 x 1672 | 1,241,501 | `0c7ad9bcf63029a62ff85576fbfc65d436dce99dfe3a0dcc047db2cb9b8b360b` |
| A45 | fitdesk-mobile-dashboard-home-screen-alternate.png | 941 x 1672 | 1,152,856 | `41e12a52ab58e676dce0c9fa8d993e5c18b65ca2b2365c8bc89be0bc2132581f` |
| A46 | fitdesk-mobile-dashboard-home-screen.png | 941 x 1672 | 1,183,921 | `e7c4ca09f1d70826bba39a5eab9b3cf8b95a68536a947a3d9f3dfb20cb50afd3` |
| A47 | fitdesk-mobile-global-search-results.png | 941 x 1672 | 1,169,396 | `e07e986dcff97ed6f5c8412fce5b02f2697b05f1875db1acbb6c09ff51be5fb0` |
| A48 | fitdesk-mobile-marketing-homepage-overview.png | 941 x 1672 | 1,388,701 | `f816282279560a80286048310b73c572e52faa855a8ec5da3d2d3d2b09b482c2` |
| A49 | fitdesk-mobile-marketing-landing-page.png | 941 x 1672 | 1,273,673 | `59be70e31eda0c58c04e6bd1c0e59f3544e9ba1a2d791fdfe2e6c0e241fc801e` |
| A50 | fitdesk-mobile-messaging-inbox-alternate.png | 941 x 1672 | 1,316,362 | `f386567865835427725a643113b6ca49990cf938743cc5198523edf0c9b8f822` |
| A51 | fitdesk-mobile-messaging-inbox.png | 941 x 1672 | 1,164,802 | `52652c59281a9f6833e01ad6280013cc7db0475bc3268931dfb5bb4eae0884c7` |
| A52 | fitdesk-mobile-more-menu-settings.png | 941 x 1672 | 1,046,413 | `3fdeba00eea2bb2cfb8015b4b33d0e04d25538a720524ae6c2bffcfdd491302d` |
| A53 | fitdesk-mobile-more-navigation-menu.png | 941 x 1672 | 1,147,408 | `240c105a985520ea4940424293f6a697f0b7a4ff93a5ecf68ebda68bc8fb05f1` |
| A54 | fitdesk-mobile-onboarding-billing-communication.png | 863 x 1822 | 1,157,232 | `aa44521f2247437089dca9d4b4c63a976832e59f6dfc82279b34d6c60d992a93` |
| A55 | fitdesk-mobile-onboarding-business-profile.png | 863 x 1822 | 1,052,827 | `e414c66c328e9c5c78235a31b068f2322182403ccc792f335ca8ca1b2df19c0e` |
| A56 | fitdesk-mobile-onboarding-review-and-start.png | 863 x 1822 | 1,240,672 | `64aab5d3d1e60aa3f978f8e870f45a3d3253bead7e3747516b891f57acccfd79` |
| A57 | fitdesk-mobile-onboarding-six-step-flow.png | 1448 x 1086 | 1,462,268 | `78e9bd90bc75ab83b1ea9c7a63231c2b4c0a01e815cefc6ba79fa694f3e8bb96` |
| A58 | fitdesk-mobile-onboarding-welcome-screen.png | 863 x 1822 | 1,094,509 | `049ec44574190004730c35576ef42f702478e773f69486aa037937817b737fe2` |
| A59 | fitdesk-mobile-onboarding-working-hours.png | 863 x 1822 | 1,115,470 | `762d29c6ff21a7daab7ee4428a358c455ec9080c8fea8e2f1a7a9019ce0ceeda` |
| A60 | fitdesk-mobile-provisioning-action-required.png | 863 x 1822 | 1,185,618 | `567b575bb7beb2842f51b88611923bd105f92528fdce9e134efeedd1a96e716b` |
| A61 | fitdesk-mobile-provisioning-failed.png | 863 x 1822 | 1,138,618 | `7b22d06a10fdc2d9ccdccac2836840d52599bddd9c5cc793790b54ad11f7d92b` |
| A62 | fitdesk-mobile-provisioning-in-progress.png | 863 x 1822 | 1,182,508 | `7f5d069ffe08fc8f9390bbd2b32e1136e8bc3b95b04f34cda8a5850bc31ad5bd` |
| A63 | fitdesk-mobile-provisioning-started.png | 863 x 1822 | 1,051,519 | `5e78c1e74ae3ffd2c75e14aa0b3b3abd56e7a5ec7af596515983e40acbee859a` |
| A64 | fitdesk-mobile-provisioning-waiting-queue.png | 863 x 1822 | 1,099,977 | `4c26902ca3e2a017397c36026684d2de46823fea16fed707cd3758b0cf57a3a8` |
| A65 | fitdesk-mobile-schedule-agenda.png | 941 x 1672 | 1,267,927 | `41af27b7296666e1b7bc272fd4506e112d09ba959fe3945f5a27266d3406f80a` |
| A66 | fitdesk-mobile-schedule-session-list.png | 941 x 1672 | 1,128,670 | `ab43573312ce3be03daed16035b34fb4b03bba06cfcd0c5348af785c5be49117` |
| A67 | fitdesk-mobile-search-results-list.png | 941 x 1672 | 1,145,600 | `6c4389bc3bd60df32983bbc09c5506877758d533e2d560af0b19bdb931da39e9` |
| A68 | fitdesk-mobile-sign-in-screen-alternate.png | 941 x 1672 | 1,308,540 | `2ad7b6c9cdf36a9ddeca45cc7cf7a4b3e6145c1e9e34681cdd82e07dca95b682` |
| A69 | fitdesk-mobile-sign-in-screen.png | 941 x 1672 | 1,197,957 | `22faf553f5f395c2f44e887152a6932cc1834de5c89a2c6333d728dd177ee50b` |
| A70 | fitdesk-mobile-workspace-readiness-flow.png | 1448 x 1086 | 1,480,457 | `654a78b21f2168551691e3aba827be1a8dbceda7a9033ebc7b2a836ec6087e20` |
| A71 | fitdesk-mobile-workspace-ready-success.png | 941 x 1672 | 1,044,482 | `8f516f77b2372eec7590c53e80be39647cfcac16379631193961cfe37675b23e` |
| A72 | fitdesk-onboarding-flow-six-step-overview.png | 1448 x 1086 | 1,439,536 | `c9609b330cc58177ffc9c70844839a462ca27e865c04c1fe2e9d6bc92baf2d47` |
| A73 | fitdesk-primary-logo-on-white.png | 1774 x 887 | 791,704 | `0bc59076091fbaa3bd81f07110d4414812a1c800ff2d51bf81fe3ef060b0c137` |
| A74 | fitdesk-responsive-billing-dashboard-showcase.png | 1448 x 1086 | 1,509,043 | `cf30c937d5c5c352faa7daa61f0cda302646ba659e22a3a602f6dc53a843e098` |
| A75 | fitdesk-responsive-clients-and-client-hub-showcase.png | 1448 x 1086 | 1,497,863 | `0f7b60566f576875e0db66d0bad1b5db4d94a2eda9047bd730649b5f60937e53` |
| A76 | fitdesk-responsive-dashboard-product-showcase.png | 1448 x 1086 | 1,353,817 | `e88fcfdbd19f5979d54066a2897b98b877e31bfd309672572941c55cf501a2a6` |
| A77 | fitdesk-responsive-messaging-inbox-showcase.png | 1448 x 1086 | 1,430,033 | `389f9fe67480689afecb58eec35f79ada2e70551fe7a170e1044ec38eae641ad` |
| A78 | fitdesk-responsive-schedule-product-showcase.png | 1448 x 1086 | 1,536,976 | `c9b130724cc9eea0e4657670e42d5d4c2adda5059c2d6f0dfa4800f1e6a00d55` |
| A79 | fitdesk-responsive-settings-product-showcase.png | 1448 x 1086 | 1,456,397 | `9b934b124e45c8b65a5f94b5acc40a6c69a51f1f658e7f1acd462c0265cf9a7b` |
| A80 | fitdesk-session-completion-flow-overview.png | 1448 x 1086 | 1,537,018 | `e0bcad1b869cbeac92e4108f4ca4a397e2154f76e0398f0cdee5d0e9c06c8106` |
| A81 | fitdesk-ui-resolver-pattern-and-state-library.png | 1448 x 1086 | 1,520,389 | `dafe83163a1642d4a1e0d81eb01422de69eda1b44abfca20bad339438fdc6261` |

---

## 5. Divergent non-canonical copies (recorded, not authoritative)

A second copy of the documentation set exists at `C:\Users\Lenovo\Dev\axis-erp\.tmp\fitdesk-build-20260719_234904\docs\` (outside the FitDesk repository, in a temp build folder):

| File | Repo size | .tmp size | .tmp SHA-256 | Verdict |
|------|-----------|-----------|--------------|---------|
| FITDESK_JOURNEY_MAP_V1.md | 242,548 | 249,089 | `35b28a163b1ed3bbca4e81e763c4b2fb58d7f933795d58b80a3ec04605bf6193` | DIVERGENT — differs from repo copy |
| FITDESK_APPLICATION_SITEMAP_V1_1.md | 46,698 | 47,954 | `ddd74af8b6dff79770c6eb51b156decdf68a3d3c41ef08210adb07a1b2cb4192` | DIVERGENT — differs from repo copy |

Ruling (mechanical, per contract): the contract binds "the repository sources", and the repository copies carry verified adoption banners whose embedded source-body hashes match (Section 2.1). The `.tmp` copies are **not** binding sources for this contract. The divergence is recorded in the conflict register (CR entry) for product-owner awareness only.

---

## 6. Repository state at freeze

```text
Branch: feat/ui-ux-modernization
HEAD:   75e8b2b
Dirty (pre-existing, untouched by Phase 0):
  M  package.json
  ?? .claude/skills/fitdesk-guardrail/
  ?? scripts/perf-baseline.mjs
  ?? scripts/visual-qa/
```

Phase 0 writes only the seven `docs/execution/FITDESK_ZERO_DRIFT_*` / matrix files. No application code, schema, package, lockfile, or deployment file is modified.
