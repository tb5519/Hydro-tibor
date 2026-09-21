import { assetDelivery } from 'hydrooj';

/** Only manifest-listed public assets are mapped; user URLs stay untouched. */
export function assetUrl(path: string, fallback = path) {
  const delivered = assetDelivery.staticAssetUrl(path);
  return delivered === path ? fallback : delivered;
}
