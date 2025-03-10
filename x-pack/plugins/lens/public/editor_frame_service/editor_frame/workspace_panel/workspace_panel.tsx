/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect, useMemo, useContext, useCallback } from 'react';
import classNames from 'classnames';
import { FormattedMessage } from '@kbn/i18n/react';
import { toExpression } from '@kbn/interpreter/common';
import { i18n } from '@kbn/i18n';
import {
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButtonEmpty,
  EuiLink,
  EuiPageContentBody,
  EuiButton,
  EuiSpacer,
} from '@elastic/eui';
import type { CoreStart, ApplicationStart } from 'kibana/public';
import type { DataPublicPluginStart, ExecutionContextSearch } from 'src/plugins/data/public';
import { RedirectAppLinks } from '../../../../../../../src/plugins/kibana_react/public';
import type {
  ExpressionRendererEvent,
  ExpressionRenderError,
  ReactExpressionRendererType,
} from '../../../../../../../src/plugins/expressions/public';
import {
  FramePublicAPI,
  isLensBrushEvent,
  isLensFilterEvent,
  isLensEditEvent,
  VisualizationMap,
  DatasourceMap,
  DatasourceFixAction,
} from '../../../types';
import { DragDrop, DragContext, DragDropIdentifier } from '../../../drag_drop';
import { Suggestion, switchToSuggestion } from '../suggestion_helpers';
import { buildExpression } from '../expression_helpers';
import { trackUiEvent } from '../../../lens_ui_telemetry';
import { UiActionsStart } from '../../../../../../../src/plugins/ui_actions/public';
import { VIS_EVENT_TO_TRIGGER } from '../../../../../../../src/plugins/visualizations/public';
import { WorkspacePanelWrapper } from './workspace_panel_wrapper';
import { DropIllustration } from '../../../assets/drop_illustration';
import { getOriginalRequestErrorMessages } from '../../error_helper';
import { getMissingIndexPattern, validateDatasourceAndVisualization } from '../state_helpers';
import { DefaultInspectorAdapters } from '../../../../../../../src/plugins/expressions/common';
import {
  onActiveDataChange,
  useLensDispatch,
  editVisualizationAction,
  updateDatasourceState,
  setSaveable,
  useLensSelector,
  selectExecutionContext,
  selectIsFullscreenDatasource,
  selectVisualization,
  selectDatasourceStates,
  selectActiveDatasourceId,
  selectSearchSessionId,
} from '../../../state_management';
import type { LensInspector } from '../../../lens_inspector_service';

export interface WorkspacePanelProps {
  visualizationMap: VisualizationMap;
  datasourceMap: DatasourceMap;
  framePublicAPI: FramePublicAPI;
  ExpressionRenderer: ReactExpressionRendererType;
  core: CoreStart;
  plugins: { uiActions?: UiActionsStart; data: DataPublicPluginStart };
  getSuggestionForField: (field: DragDropIdentifier) => Suggestion | undefined;
  lensInspector: LensInspector;
}

interface WorkspaceState {
  expressionBuildError?: Array<{
    shortMessage: string;
    longMessage: React.ReactNode;
    fixAction?: DatasourceFixAction<unknown>;
  }>;
  expandError: boolean;
}

const dropProps = {
  value: {
    id: 'lnsWorkspace',
    humanData: {
      label: i18n.translate('xpack.lens.editorFrame.workspaceLabel', {
        defaultMessage: 'Workspace',
      }),
    },
  },
  order: [1, 0, 0, 0],
};

// Exported for testing purposes only.
export const WorkspacePanel = React.memo(function WorkspacePanel(props: WorkspacePanelProps) {
  const { getSuggestionForField, ...restProps } = props;

  const dragDropContext = useContext(DragContext);

  const suggestionForDraggedField = useMemo(
    () => dragDropContext.dragging && getSuggestionForField(dragDropContext.dragging),
    [dragDropContext.dragging, getSuggestionForField]
  );

  return (
    <InnerWorkspacePanel {...restProps} suggestionForDraggedField={suggestionForDraggedField} />
  );
});

// Exported for testing purposes only.
export const InnerWorkspacePanel = React.memo(function InnerWorkspacePanel({
  framePublicAPI,
  visualizationMap,
  datasourceMap,
  core,
  plugins,
  ExpressionRenderer: ExpressionRendererComponent,
  suggestionForDraggedField,
  lensInspector,
}: Omit<WorkspacePanelProps, 'getSuggestionForField'> & {
  suggestionForDraggedField: Suggestion | undefined;
}) {
  const dispatchLens = useLensDispatch();
  const isFullscreen = useLensSelector(selectIsFullscreenDatasource);
  const visualization = useLensSelector(selectVisualization);
  const activeDatasourceId = useLensSelector(selectActiveDatasourceId);
  const datasourceStates = useLensSelector(selectDatasourceStates);

  const { datasourceLayers } = framePublicAPI;
  const [localState, setLocalState] = useState<WorkspaceState>({
    expressionBuildError: undefined,
    expandError: false,
  });

  const activeVisualization = visualization.activeId
    ? visualizationMap[visualization.activeId]
    : null;

  const missingIndexPatterns = getMissingIndexPattern(
    activeDatasourceId ? datasourceMap[activeDatasourceId] : null,
    activeDatasourceId ? datasourceStates[activeDatasourceId] : null
  );

  const missingRefsErrors = missingIndexPatterns.length
    ? [
        {
          shortMessage: '',
          longMessage: i18n.translate('xpack.lens.indexPattern.missingDataView', {
            defaultMessage:
              'The {count, plural, one {data view} other {data views}} ({count, plural, one {id} other {ids}}: {indexpatterns}) cannot be found',
            values: {
              count: missingIndexPatterns.length,
              indexpatterns: missingIndexPatterns.join(', '),
            },
          }),
        },
      ]
    : [];

  // Note: mind to all these eslint disable lines: the frameAPI will change too frequently
  // and to prevent race conditions it is ok to leave them there.

  const configurationValidationError = useMemo(
    () =>
      validateDatasourceAndVisualization(
        activeDatasourceId ? datasourceMap[activeDatasourceId] : null,
        activeDatasourceId && datasourceStates[activeDatasourceId]?.state,
        activeVisualization,
        visualization.state,
        framePublicAPI
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeVisualization, visualization.state, activeDatasourceId, datasourceMap, datasourceStates]
  );

  const expression = useMemo(() => {
    if (!configurationValidationError?.length && !missingRefsErrors.length) {
      try {
        const ast = buildExpression({
          visualization: activeVisualization,
          visualizationState: visualization.state,
          datasourceMap,
          datasourceStates,
          datasourceLayers,
        });

        if (ast) {
          // expression has to be turned into a string for dirty checking - if the ast is rebuilt,
          // turning it into a string will make sure the expression renderer only re-renders if the
          // expression actually changed.
          return toExpression(ast);
        } else {
          return null;
        }
      } catch (e) {
        const buildMessages = activeVisualization?.getErrorMessages(visualization.state);
        const defaultMessage = {
          shortMessage: i18n.translate('xpack.lens.editorFrame.buildExpressionError', {
            defaultMessage: 'An unexpected error occurred while preparing the chart',
          }),
          longMessage: e.toString(),
        };
        // Most likely an error in the expression provided by a datasource or visualization
        setLocalState((s) => ({
          ...s,
          expressionBuildError: buildMessages ?? [defaultMessage],
        }));
      }
    }
  }, [
    activeVisualization,
    visualization.state,
    datasourceMap,
    datasourceStates,
    datasourceLayers,
    configurationValidationError?.length,
    missingRefsErrors.length,
  ]);

  const expressionExists = Boolean(expression);
  useEffect(() => {
    dispatchLens(setSaveable(expressionExists));
  }, [expressionExists, dispatchLens]);

  const onEvent = useCallback(
    (event: ExpressionRendererEvent) => {
      if (!plugins.uiActions) {
        // ui actions not available, not handling event...
        return;
      }
      if (isLensBrushEvent(event)) {
        plugins.uiActions.getTrigger(VIS_EVENT_TO_TRIGGER[event.name]).exec({
          data: event.data,
        });
      }
      if (isLensFilterEvent(event)) {
        plugins.uiActions.getTrigger(VIS_EVENT_TO_TRIGGER[event.name]).exec({
          data: event.data,
        });
      }
      if (isLensEditEvent(event) && activeVisualization?.onEditAction) {
        dispatchLens(
          editVisualizationAction({
            visualizationId: activeVisualization.id,
            event,
          })
        );
      }
    },
    [plugins.uiActions, activeVisualization, dispatchLens]
  );

  useEffect(() => {
    // reset expression error if component attempts to run it again
    if (expressionExists && localState.expressionBuildError) {
      setLocalState((s) => ({
        ...s,
        expressionBuildError: undefined,
      }));
    }
  }, [expressionExists, localState.expressionBuildError]);

  const onDrop = useCallback(() => {
    if (suggestionForDraggedField) {
      trackUiEvent('drop_onto_workspace');
      trackUiEvent(expressionExists ? 'drop_non_empty' : 'drop_empty');
      switchToSuggestion(dispatchLens, suggestionForDraggedField, true);
    }
  }, [suggestionForDraggedField, expressionExists, dispatchLens]);

  const renderEmptyWorkspace = () => {
    return (
      <EuiText
        className={classNames('lnsWorkspacePanel__emptyContent')}
        textAlign="center"
        color="subdued"
        data-test-subj="empty-workspace"
        size="s"
      >
        <h2>
          <strong>
            {!expressionExists
              ? i18n.translate('xpack.lens.editorFrame.emptyWorkspace', {
                  defaultMessage: 'Drop some fields here to start',
                })
              : i18n.translate('xpack.lens.editorFrame.emptyWorkspaceSimple', {
                  defaultMessage: 'Drop field here',
                })}
          </strong>
        </h2>
        <DropIllustration aria-hidden={true} className="lnsWorkspacePanel__dropIllustration" />
        {!expressionExists && (
          <>
            <p>
              {i18n.translate('xpack.lens.editorFrame.emptyWorkspaceHeading', {
                defaultMessage: 'Lens is a new tool for creating visualization',
              })}
            </p>
            <p>
              <small>
                <EuiLink
                  href="https://www.elastic.co/products/kibana/feedback"
                  target="_blank"
                  external
                >
                  {i18n.translate('xpack.lens.editorFrame.goToForums', {
                    defaultMessage: 'Make requests and give feedback',
                  })}
                </EuiLink>
              </small>
            </p>
          </>
        )}
      </EuiText>
    );
  };

  const renderVisualization = () => {
    if (expression === null) {
      return renderEmptyWorkspace();
    }
    return (
      <VisualizationWrapper
        expression={expression}
        framePublicAPI={framePublicAPI}
        lensInspector={lensInspector}
        onEvent={onEvent}
        setLocalState={setLocalState}
        localState={{ ...localState, configurationValidationError, missingRefsErrors }}
        ExpressionRendererComponent={ExpressionRendererComponent}
        application={core.application}
        activeDatasourceId={activeDatasourceId}
      />
    );
  };

  const element = expression !== null ? renderVisualization() : renderEmptyWorkspace();

  const dragDropContext = useContext(DragContext);

  const renderDragDrop = () => {
    const customWorkspaceRenderer =
      activeDatasourceId &&
      datasourceMap[activeDatasourceId]?.getCustomWorkspaceRenderer &&
      dragDropContext.dragging
        ? datasourceMap[activeDatasourceId].getCustomWorkspaceRenderer!(
            datasourceStates[activeDatasourceId].state,
            dragDropContext.dragging
          )
        : undefined;

    return customWorkspaceRenderer ? (
      customWorkspaceRenderer()
    ) : (
      <DragDrop
        className={classNames('lnsWorkspacePanel__dragDrop', {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'lnsWorkspacePanel__dragDrop--fullscreen': isFullscreen,
        })}
        dataTestSubj="lnsWorkspace"
        draggable={false}
        dropTypes={suggestionForDraggedField ? ['field_add'] : undefined}
        onDrop={onDrop}
        value={dropProps.value}
        order={dropProps.order}
      >
        <EuiPageContentBody className="lnsWorkspacePanelWrapper__pageContentBody">
          {element}
        </EuiPageContentBody>
      </DragDrop>
    );
  };

  return (
    <WorkspacePanelWrapper
      framePublicAPI={framePublicAPI}
      visualizationState={visualization.state}
      visualizationId={visualization.activeId}
      datasourceStates={datasourceStates}
      datasourceMap={datasourceMap}
      visualizationMap={visualizationMap}
      isFullscreen={isFullscreen}
    >
      {renderDragDrop()}
    </WorkspacePanelWrapper>
  );
});

export const VisualizationWrapper = ({
  expression,
  framePublicAPI,
  lensInspector,
  onEvent,
  setLocalState,
  localState,
  ExpressionRendererComponent,
  application,
  activeDatasourceId,
}: {
  expression: string | null | undefined;
  framePublicAPI: FramePublicAPI;
  lensInspector: LensInspector;
  onEvent: (event: ExpressionRendererEvent) => void;
  setLocalState: (dispatch: (prevState: WorkspaceState) => WorkspaceState) => void;
  localState: WorkspaceState & {
    configurationValidationError?: Array<{
      shortMessage: string;
      longMessage: React.ReactNode;
      fixAction?: DatasourceFixAction<unknown>;
    }>;
    missingRefsErrors?: Array<{ shortMessage: string; longMessage: React.ReactNode }>;
  };
  ExpressionRendererComponent: ReactExpressionRendererType;
  application: ApplicationStart;
  activeDatasourceId: string | null;
}) => {
  const context = useLensSelector(selectExecutionContext);
  const searchContext: ExecutionContextSearch = useMemo(
    () => ({
      query: context.query,
      timeRange: {
        from: context.dateRange.fromDate,
        to: context.dateRange.toDate,
      },
      filters: context.filters,
    }),
    [context]
  );
  const searchSessionId = useLensSelector(selectSearchSessionId);

  const dispatchLens = useLensDispatch();

  const onData$ = useCallback(
    (data: unknown, adapters?: Partial<DefaultInspectorAdapters>) => {
      if (adapters && adapters.tables) {
        dispatchLens(onActiveDataChange({ ...adapters.tables.tables }));
      }
    },
    [dispatchLens]
  );

  function renderFixAction(
    validationError:
      | {
          shortMessage: string;
          longMessage: React.ReactNode;
          fixAction?: DatasourceFixAction<unknown>;
        }
      | undefined
  ) {
    return (
      validationError &&
      validationError.fixAction &&
      activeDatasourceId && (
        <>
          <EuiButton
            data-test-subj="errorFixAction"
            onClick={async () => {
              trackUiEvent('error_fix_action');
              const newState = await validationError.fixAction?.newState({
                ...framePublicAPI,
                ...context,
              });
              dispatchLens(
                updateDatasourceState({
                  updater: newState,
                  datasourceId: activeDatasourceId,
                })
              );
            }}
          >
            {validationError.fixAction.label}
          </EuiButton>
          <EuiSpacer />
        </>
      )
    );
  }

  if (localState.configurationValidationError?.length) {
    let showExtraErrors = null;
    let showExtraErrorsAction = null;

    if (localState.configurationValidationError.length > 1) {
      if (localState.expandError) {
        showExtraErrors = localState.configurationValidationError
          .slice(1)
          .map((validationError) => (
            <>
              <p
                key={validationError.shortMessage}
                className="eui-textBreakWord"
                data-test-subj="configuration-failure-error"
              >
                {validationError.longMessage}
              </p>
              {renderFixAction(validationError)}
            </>
          ));
      } else {
        showExtraErrorsAction = (
          <EuiButtonEmpty
            onClick={() => {
              setLocalState((prevState: WorkspaceState) => ({
                ...prevState,
                expandError: !prevState.expandError,
              }));
            }}
            data-test-subj="configuration-failure-more-errors"
          >
            {i18n.translate('xpack.lens.editorFrame.configurationFailureMoreErrors', {
              defaultMessage: ` +{errors} {errors, plural, one {error} other {errors}}`,
              values: { errors: localState.configurationValidationError.length - 1 },
            })}
          </EuiButtonEmpty>
        );
      }
    }

    return (
      <EuiFlexGroup data-test-subj="configuration-failure">
        <EuiFlexItem>
          <EuiEmptyPrompt
            actions={showExtraErrorsAction}
            body={
              <>
                <p className="eui-textBreakWord" data-test-subj="configuration-failure-error">
                  {localState.configurationValidationError[0].longMessage}
                </p>
                {renderFixAction(localState.configurationValidationError?.[0])}

                {showExtraErrors}
              </>
            }
            iconColor="danger"
            iconType="alert"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (localState.missingRefsErrors?.length) {
    // Check for access to both Management app && specific indexPattern section
    const { management: isManagementEnabled } = application.capabilities.navLinks;
    const isIndexPatternManagementEnabled =
      application.capabilities.management.kibana.indexPatterns;
    return (
      <EuiFlexGroup data-test-subj="configuration-failure">
        <EuiFlexItem>
          <EuiEmptyPrompt
            actions={
              isManagementEnabled && isIndexPatternManagementEnabled ? (
                <RedirectAppLinks application={application}>
                  <a
                    href={application.getUrlForApp('management', {
                      path: '/kibana/indexPatterns/create',
                    })}
                    data-test-subj="configuration-failure-reconfigure-indexpatterns"
                  >
                    {i18n.translate('xpack.lens.editorFrame.dataViewReconfigure', {
                      defaultMessage: `Recreate it in the data view management page`,
                    })}
                  </a>
                </RedirectAppLinks>
              ) : null
            }
            body={
              <>
                <p className="eui-textBreakWord" data-test-subj="missing-refs-failure">
                  <FormattedMessage
                    id="xpack.lens.editorFrame.dataViewNotFound"
                    defaultMessage="Data view not found"
                  />
                </p>
                <p className="eui-textBreakWord lnsSelectableErrorMessage">
                  {localState.missingRefsErrors[0].longMessage}
                </p>
              </>
            }
            iconColor="danger"
            iconType="alert"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (localState.expressionBuildError?.length) {
    const firstError = localState.expressionBuildError[0];
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiEmptyPrompt
            body={
              <>
                <p data-test-subj="expression-failure">
                  <FormattedMessage
                    id="xpack.lens.editorFrame.expressionFailure"
                    defaultMessage="An error occurred in the expression"
                  />
                </p>

                <p>{firstError.longMessage}</p>
              </>
            }
            iconColor="danger"
            iconType="alert"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <div className="lnsExpressionRenderer">
      <ExpressionRendererComponent
        className="lnsExpressionRenderer__component"
        padding="m"
        expression={expression!}
        searchContext={searchContext}
        searchSessionId={searchSessionId}
        onEvent={onEvent}
        onData$={onData$}
        inspectorAdapters={lensInspector.adapters}
        renderMode="edit"
        renderError={(errorMessage?: string | null, error?: ExpressionRenderError | null) => {
          const errorsFromRequest = getOriginalRequestErrorMessages(error);
          const visibleErrorMessages = errorsFromRequest.length
            ? errorsFromRequest
            : errorMessage
            ? [errorMessage]
            : [];

          return (
            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiEmptyPrompt
                  actions={
                    visibleErrorMessages.length && !localState.expandError ? (
                      <EuiButtonEmpty
                        onClick={() => {
                          setLocalState((prevState: WorkspaceState) => ({
                            ...prevState,
                            expandError: !prevState.expandError,
                          }));
                        }}
                      >
                        {i18n.translate('xpack.lens.editorFrame.expandRenderingErrorButton', {
                          defaultMessage: 'Show details of error',
                        })}
                      </EuiButtonEmpty>
                    ) : null
                  }
                  body={
                    <>
                      <p data-test-subj="expression-failure">
                        <FormattedMessage
                          id="xpack.lens.editorFrame.dataFailure"
                          defaultMessage="An error occurred when loading data."
                        />
                      </p>

                      {localState.expandError
                        ? visibleErrorMessages.map((visibleErrorMessage) => (
                            <p className="eui-textBreakWord" key={visibleErrorMessage}>
                              {visibleErrorMessage}
                            </p>
                          ))
                        : null}
                    </>
                  }
                  iconColor="danger"
                  iconType="alert"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        }}
      />
    </div>
  );
};
