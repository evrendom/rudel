# Changelog

## [0.1.9](https://github.com/obsessiondb/rudel/compare/rudel@0.1.8...rudel@0.1.9) (2026-03-11)


### Bug Fixes

* **cli:** prevent prompt injection in session classifier ([#133](https://github.com/obsessiondb/rudel/issues/133)) ([b234023](https://github.com/obsessiondb/rudel/commit/b234023b8c381fdb0e1983080c7fa5f87e8a1c2e))
* replace CLI loopback token handoff with device code flow ([#141](https://github.com/obsessiondb/rudel/issues/141)) ([d2f1372](https://github.com/obsessiondb/rudel/commit/d2f1372be2aefe21e912a11531e50d0cfcd63778))

## [0.1.8](https://github.com/obsessiondb/rudel/compare/rudel@0.1.7...rudel@0.1.8) (2026-03-03)


### Features

* implement developer name resolution with git remote and package name ([#111](https://github.com/obsessiondb/rudel/issues/111)) ([f675de6](https://github.com/obsessiondb/rudel/commit/f675de6717ff6f0f14e8d50414aa47cc5845b9eb))
* remove repository column from ClickHouse schema ([#114](https://github.com/obsessiondb/rudel/issues/114)) ([6547b25](https://github.com/obsessiondb/rudel/commit/6547b2594666d899ebf0e366bbf85c87df5888d8))

## [0.1.7](https://github.com/obsessiondb/rudel/compare/rudel@0.1.6...rudel@0.1.7) (2026-03-03)


### Bug Fixes

* move agent-adapters to devDependencies to fix npm install error ([#105](https://github.com/obsessiondb/rudel/issues/105)) ([84f3544](https://github.com/obsessiondb/rudel/commit/84f35446fb9f455f865355d2e7c30c941c4ab44a))

## [0.1.6](https://github.com/obsessiondb/rudel/compare/rudel@0.1.5...rudel@0.1.6) (2026-03-02)


### Features

* add explicit retry, progress tracking, and failed upload tracking for CLI uploads ([#96](https://github.com/obsessiondb/rudel/issues/96)) ([419983d](https://github.com/obsessiondb/rudel/commit/419983d79060e27b138dc1be9d52a8a3e8e4526a))
* add git_remote and package_name as primary project identity signals ([#90](https://github.com/obsessiondb/rudel/issues/90)) ([1fda8bb](https://github.com/obsessiondb/rudel/commit/1fda8bbd175e444795c812687970feccf02b5842))
* add OpenAI Codex session support ([#86](https://github.com/obsessiondb/rudel/issues/86)) ([5e21a9c](https://github.com/obsessiondb/rudel/commit/5e21a9cdafa8d6623b07d0a7697e0fa825451117))
* add structured logging via @logtape/logtape ([#93](https://github.com/obsessiondb/rudel/issues/93)) ([b3ede93](https://github.com/obsessiondb/rudel/commit/b3ede9341a7cc99487e4a8d5c05264c5edd069a7))
* make agent source type-safe with enum ([#100](https://github.com/obsessiondb/rudel/issues/100)) ([fac4498](https://github.com/obsessiondb/rudel/commit/fac44983e4578e3655d84c20d31c0d932714e223))
* refactor batch uploads with separated logic and UI layers ([#97](https://github.com/obsessiondb/rudel/issues/97)) ([91ffb1a](https://github.com/obsessiondb/rudel/commit/91ffb1a49cfb268b775a2f27269b68d691ba7135))


### Bug Fixes

* correct ClickHouse set index syntax in migration ([#95](https://github.com/obsessiondb/rudel/issues/95)) ([ddf1da0](https://github.com/obsessiondb/rudel/commit/ddf1da0385573d073787a17fc70d8fa7ac319ca6))
* unify session discovery logic between enable and upload commands ([#94](https://github.com/obsessiondb/rudel/issues/94)) ([48e0ed6](https://github.com/obsessiondb/rudel/commit/48e0ed617838be6191671ec371fd2cbef0aabc13))

## [0.1.5](https://github.com/obsessiondb/rudel/compare/rudel@0.1.4...rudel@0.1.5) (2026-03-02)


### Features

* add auth verification and retroactive session uploads to enable command ([#63](https://github.com/obsessiondb/rudel/issues/63)) ([d6a4a5a](https://github.com/obsessiondb/rudel/commit/d6a4a5a9295c4e33359d982a671bfd836dd6f32f))
* add dev workspace with list-sessions command ([#75](https://github.com/obsessiondb/rudel/issues/75)) ([a0321ef](https://github.com/obsessiondb/rudel/commit/a0321ef1fa79ba04742ea291fe0868c705702ed4))
* add interactive project picker for rudel upload ([#66](https://github.com/obsessiondb/rudel/issues/66)) ([85bb3c9](https://github.com/obsessiondb/rudel/commit/85bb3c9a16d4c4531b86bf848db8344f133f7a5e))
* add organization deletion with session migration support ([#74](https://github.com/obsessiondb/rudel/issues/74)) ([1318351](https://github.com/obsessiondb/rudel/commit/13183517d4392a846c524992ab4b71e4e46635bf))
* make Rudel multitenant with organization support ([#43](https://github.com/obsessiondb/rudel/issues/43)) ([e40e589](https://github.com/obsessiondb/rudel/commit/e40e5897fcab697f1156bbdfff50eefb16ec3644))

## 0.1.4

Initial open-source release.
