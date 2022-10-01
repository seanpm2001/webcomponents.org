/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  Timestamp,
  WithFieldValue,
} from '@google-cloud/firestore';

import {
  DistTag,
  isReadablePackage,
  PackageInfo,
  ReadablePackageInfo,
} from '@webcomponents/catalog-api/lib/schema.js';

export const packageInfoConverter: FirestoreDataConverter<
  Omit<PackageInfo, 'version'>
> = {
  fromFirestore(
    snapshot: QueryDocumentSnapshot<DocumentData>
  ): Omit<PackageInfo, 'version'> {
    const distTags = snapshot.get('distTags');
    const graphQLDistTags = Object.entries(distTags).map(
      ([tag, version]) => ({tag, version} as DistTag)
    );
    return {
      name: idToPackageName(snapshot.id),
      lastUpdate: (snapshot.get('lastUpdate') as Timestamp).toDate(),
      status: snapshot.get('status'),
      description: snapshot.get('description'),
      distTags: graphQLDistTags,
      // `version` is left to a sub-collection query
    } as ReadablePackageInfo;
  },
  toFirestore(packageInfo: WithFieldValue<PackageInfo>) {
    if (isReadablePackage(packageInfo as PackageInfo)) {
      const data = packageInfo as WithFieldValue<ReadablePackageInfo>;
      return {
        status: data.status,
        // TODO (justinfagnani): we could force this to be
        // FieldValue.serverTimestamp() here.
        lastUpdate: data.lastUpdate,
        description: data.description,
        distTags: new Map(
          // We don't support FieldValues in distTags, so cast away:
          (data.distTags as DistTag[]).map((t) => [t.tag, t.version])
        ),
      };
    } else {
      return {
        status: packageInfo.status,
        lastUpdate: packageInfo.lastUpdate,
      };
    }
  },
};

/**
 * Converts a package name to a Firestore ID.
 *
 * Firestore IDs cannot include a '/', so we convert it to '__'.
 *
 * This is a similar to the transform TypeScript does for `@types`
 * packages.
 */
export const packageNameToId = (packageName: string) =>
  packageName.replace('/', '__');

/**
 * Converts a Firestore ID to a package name.
 */
export const idToPackageName = (packageName: string) =>
  packageName.replace('__', '/');