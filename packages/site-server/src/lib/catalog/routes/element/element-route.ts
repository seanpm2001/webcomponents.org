/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This must be imported before lit
import {renderPage} from '@webcomponents/internal-site-content/templates/lib/base.js';

import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';
import {Readable} from 'stream';
import {gql} from '@apollo/client/core/index.js';
import Router from '@koa/router';

import {renderElementPage} from '@webcomponents/internal-site-client/lib/entrypoints/element.js';
import {client} from '../../graphql.js';

export const handleElementRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
  const {params} = context;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const elementPath = params['path']!;
  const elementPathSegments = elementPath.split('/');

  const isScoped = elementPathSegments[0]?.startsWith('@');

  if (
    (isScoped && elementPathSegments.length !== 3) ||
    (!isScoped && elementPathSegments.length !== 2)
  ) {
    context.status = 404;
    context.body = `Not Found`;
    return;
  }

  const packageName = isScoped
    ? elementPathSegments[0] + '/' + elementPathSegments[1]
    : elementPathSegments[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const elementName = elementPathSegments[isScoped ? 2 : 1]!;

  // TODO (justinfagnani): To make this type-safe, we need to write
  // a query .graphql document and generate a TypedDocumentNode from it.
  const result = await client.query({
    query: gql`
      {
        package(packageName: "${packageName}") {
          ... on ReadablePackageInfo {
            name
            description
            version {
              ... on ReadablePackageVersion {
                version
                description
                customElements(tagName: "${elementName}") {
                  tagName
                  declaration
                  customElementExport
                  declaration
                }
                customElementsManifest
              }
            }
          }
        }
      }
    `,
  });

  if (result.errors !== undefined && result.errors.length > 0) {
    throw new Error(result.errors.map((e) => e.message).join('\n'));
  }
  const {data} = result;
  const packageVersion = data.package?.version;
  if (packageVersion === undefined) {
    throw new Error(`No such package version: ${packageName}`);
  }
  const customElementsManifest =
    packageVersion.customElementsManifest !== undefined &&
    JSON.parse(packageVersion.customElementsManifest);

  const customElement = packageVersion.customElements?.[0];

  if (customElement === undefined || customElement.tagName !== elementName) {
    throw new Error('Internal error');
  }

  const elementData = {
    packageName: packageName,
    elementName: elementName,
    declarationReference: customElement.declaration,
    customElementExport: customElement.customElementExport,
    manifest: customElementsManifest,
  };

  // URL isn't exactly a Location, but it's close enough for read-only uses
  window.location = new URL(context.URL.href) as unknown as Location;

  context.type = 'html';
  context.status = 200;
  context.body = Readable.from(
    renderPage(
      {
        title: `${packageName}/${elementName}`,
        scripts: ['/js/hydrate.js', '/js/element.js'],
        initScript: '/js/element-hydrate.js',
        content: renderElementPage(elementData),
        initialData: [elementData],
      },
      {
        // We need to defer elements from hydrating so that we can
        // manually provide data to the element in element-hydrate.js
        deferHydration: true,
      }
    )
  );
};