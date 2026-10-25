// Canonical selective-disclosure verifying-key hashes, pinned out of band from
// deployments/testnet/circuit_keys/README.md @ ea39d0c (the same pins as
// scripts/smoke.mjs). A receipt's own vkHash is never trusted.
export const DISCLOSURE_VK_HASHES: Record<string, string> = {
  selectiveDisclosure_1: "0x6fc11e281a749639762df720450be1182051c93d83e6cff36248896508d85ee2",
  selectiveDisclosure_2: "0x0a4def6573b3982661a2afc082f07cbd88baaa61734c612291434a771879f75e",
};
