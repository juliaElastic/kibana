/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { KibanaRequest, RequestHandlerContext } from 'kibana/server';
import { ExceptionListClient } from '../../lists/server';

import { DEFAULT_SPACE_ID } from '../common/constants';
import { AppClientFactory } from './client';
import { ConfigType } from './config';
import { RuleExecutionLogClient } from './lib/detection_engine/rule_execution_log/rule_execution_log_client';
import { buildFrameworkRequest } from './lib/timeline/utils/common';
import {
  SecuritySolutionPluginCoreSetupDependencies,
  SecuritySolutionPluginSetupDependencies,
} from './plugin_contract';
import { SecuritySolutionApiRequestHandlerContext } from './types';

export interface IRequestContextFactory {
  create(
    context: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<SecuritySolutionApiRequestHandlerContext>;
}

interface ConstructorOptions {
  config: ConfigType;
  core: SecuritySolutionPluginCoreSetupDependencies;
  plugins: SecuritySolutionPluginSetupDependencies;
}

export class RequestContextFactory implements IRequestContextFactory {
  private readonly appClientFactory: AppClientFactory;

  constructor(private readonly options: ConstructorOptions) {
    const { config, plugins } = options;

    this.appClientFactory = new AppClientFactory();
    this.appClientFactory.setup({
      getSpaceId: plugins.spaces?.spacesService?.getSpaceId,
      config,
    });
  }

  public async create(
    context: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<SecuritySolutionApiRequestHandlerContext> {
    const { options, appClientFactory } = this;
    const { config, core, plugins } = options;
    const { lists, ruleRegistry, security, spaces } = plugins;

    const [, startPlugins] = await core.getStartServices();
    const frameworkRequest = await buildFrameworkRequest(context, security, request);

    return {
      core: context.core,

      getConfig: () => config,

      getFrameworkRequest: () => frameworkRequest,

      getAppClient: () => appClientFactory.create(request),

      getSpaceId: () => spaces?.spacesService?.getSpaceId(request) || DEFAULT_SPACE_ID,

      getRuleDataService: () => ruleRegistry.ruleDataService,

      getExecutionLogClient: () =>
        new RuleExecutionLogClient({
          underlyingClient: config.ruleExecutionLog.underlyingClient,
          savedObjectsClient: context.core.savedObjects.client,
          eventLogService: plugins.eventLog,
          eventLogClient: startPlugins.eventLog.getClient(request),
        }),

      getExceptionListClient: () => {
        if (!lists) {
          return null;
        }

        const username = security?.authc.getCurrentUser(request)?.username || 'elastic';
        return new ExceptionListClient({
          savedObjectsClient: context.core.savedObjects.client,
          user: username,
        });
      },
    };
  }
}
