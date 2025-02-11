import * as React from 'react';
import { GridEvents } from '../../../constants/eventsConstants';
import { GridComponentProps } from '../../../GridComponentProps';
import { GridApiRef } from '../../../models/api/gridApiRef';
import { GridSelectionApi } from '../../../models/api/gridSelectionApi';
import { GridRowParams } from '../../../models/params/gridRowParams';
import { GridRowId } from '../../../models/gridRows';
import { useGridApiEventHandler } from '../../root/useGridApiEventHandler';
import { useGridApiMethod } from '../../root/useGridApiMethod';
import { useGridLogger } from '../../utils/useGridLogger';
import { useGridSelector } from '../core/useGridSelector';
import { useGridState } from '../core/useGridState';
import { gridRowsLookupSelector } from '../rows/gridRowsSelector';
import {
  gridSelectionStateSelector,
  selectedGridRowsSelector,
  selectedIdsLookupSelector,
} from './gridSelectionSelector';
import { visibleSortedGridRowIdsSelector } from '../filter';
import { GridCellParams } from '../../../models/params/gridCellParams';
import { GridRowSelectionCheckboxParams } from '../../../models/params/gridRowSelectionCheckboxParams';

/**
 * @requires useGridRows (state, method)
 * @requires useGridParamsApi (method)
 * @requires useGridControlState (method)
 */
export const useGridSelection = (
  apiRef: GridApiRef,
  props: Pick<
    GridComponentProps,
    | 'checkboxSelection'
    | 'selectionModel'
    | 'onSelectionModelChange'
    | 'disableMultipleSelection'
    | 'disableSelectionOnClick'
    | 'isRowSelectable'
    | 'checkboxSelectionVisibleOnly'
    | 'pagination'
  >,
): void => {
  const logger = useGridLogger(apiRef, 'useGridSelection');
  const [, setGridState, forceUpdate] = useGridState(apiRef);
  const rowsLookup = useGridSelector(apiRef, gridRowsLookupSelector);
  const lastRowToggled = React.useRef<GridRowId | null>(null);

  const propSelectionModel = React.useMemo(() => {
    if (props.selectionModel == null) {
      return props.selectionModel;
    }

    if (Array.isArray(props.selectionModel)) {
      return props.selectionModel;
    }

    return [props.selectionModel];
  }, [props.selectionModel]);

  const { checkboxSelection, disableMultipleSelection, disableSelectionOnClick, isRowSelectable } =
    props;

  const canHaveMultipleSelection = !disableMultipleSelection || checkboxSelection;

  const getSelectedRows = React.useCallback<GridSelectionApi['getSelectedRows']>(
    () => selectedGridRowsSelector(apiRef.current.state),
    [apiRef],
  );

  const selectRow = React.useCallback<GridSelectionApi['selectRow']>(
    (id, isSelected = true, resetSelection = false) => {
      if (isRowSelectable && !isRowSelectable(apiRef.current.getRowParams(id))) {
        return;
      }

      lastRowToggled.current = id;

      if (resetSelection) {
        logger.debug(`Setting selection for row ${id}`);

        apiRef.current.setSelectionModel(isSelected ? [id] : []);
      } else {
        logger.debug(`Toggling selection for row ${id}`);

        const selection = gridSelectionStateSelector(apiRef.current.state);
        const newSelection: GridRowId[] = selection.filter((el) => el !== id);

        if (isSelected) {
          newSelection.push(id);
        }

        const isSelectionValid = newSelection.length < 2 || canHaveMultipleSelection;
        if (isSelectionValid) {
          apiRef.current.setSelectionModel(newSelection);
        }
      }
    },
    [apiRef, isRowSelectable, logger, canHaveMultipleSelection],
  );

  const selectRows = React.useCallback<GridSelectionApi['selectRows']>(
    (ids: GridRowId[], isSelected = true, resetSelection = false) => {
      logger.debug(`Setting selection for several rows`);

      const selectableIds = isRowSelectable
        ? ids.filter((id) => isRowSelectable(apiRef.current.getRowParams(id)))
        : ids;

      let newSelection: GridRowId[];
      if (resetSelection) {
        newSelection = isSelected ? selectableIds : [];
      } else {
        // We clone the existing object to avoid mutating the same object returned by the selector to others part of the project
        const selectionLookup = { ...selectedIdsLookupSelector(apiRef.current.state) };

        selectableIds.forEach((id) => {
          if (isSelected) {
            selectionLookup[id] = id;
          } else {
            delete selectionLookup[id];
          }
        });

        newSelection = Object.values(selectionLookup);
      }

      const isSelectionValid = newSelection.length < 2 || canHaveMultipleSelection;
      if (isSelectionValid) {
        apiRef.current.setSelectionModel(newSelection);
      }
    },
    [apiRef, isRowSelectable, logger, canHaveMultipleSelection],
  );

  const selectRowRange = React.useCallback<GridSelectionApi['selectRowRange']>(
    (
      {
        startId,
        endId,
      }: {
        startId: GridRowId;
        endId: GridRowId;
      },
      isSelected = true,
      resetSelection,
    ) => {
      if (!apiRef.current.getRow(startId) || !apiRef.current.getRow(endId)) {
        return;
      }

      logger.debug(`Expanding selection from row ${startId} to row ${endId}`);

      const visibleRowIds = visibleSortedGridRowIdsSelector(apiRef.current.state);
      const startIndex = visibleRowIds.indexOf(startId);
      const endIndex = visibleRowIds.indexOf(endId);
      const [start, end] = startIndex > endIndex ? [endIndex, startIndex] : [startIndex, endIndex];
      const rowsBetweenStartAndEnd = visibleRowIds.slice(start, end + 1);

      apiRef.current.selectRows(rowsBetweenStartAndEnd, isSelected, resetSelection);
    },
    [apiRef, logger],
  );

  const expandRowRangeSelection = React.useCallback(
    (id: GridRowId) => {
      let endId = id;
      const startId = lastRowToggled.current ?? id;
      const isSelected = apiRef.current.isRowSelected(id);
      if (isSelected) {
        const visibleRowIds = visibleSortedGridRowIdsSelector(apiRef.current.state);
        const startIndex = visibleRowIds.findIndex((rowId) => rowId === startId);
        const endIndex = visibleRowIds.findIndex((rowId) => rowId === endId);
        if (startIndex > endIndex) {
          endId = visibleRowIds[endIndex + 1];
        } else {
          endId = visibleRowIds[endIndex - 1];
        }
      }

      lastRowToggled.current = id;

      apiRef.current.selectRowRange({ startId, endId }, !isSelected);
    },
    [apiRef],
  );

  const setSelectionModel = React.useCallback<GridSelectionApi['setSelectionModel']>(
    (model) => {
      const currentModel = gridSelectionStateSelector(apiRef.current.state);
      if (currentModel !== model) {
        setGridState((state) => ({ ...state, selection: model }));
        forceUpdate();
      }
    },
    [setGridState, apiRef, forceUpdate],
  );

  const isRowSelected = React.useCallback<GridSelectionApi['isRowSelected']>(
    (id) => gridSelectionStateSelector(apiRef.current.state).includes(id),
    [apiRef],
  );

  const handleRowClick = React.useCallback(
    (params: GridRowParams, event: React.MouseEvent) => {
      if (disableSelectionOnClick) {
        return;
      }

      const hasCtrlKey = event.metaKey || event.ctrlKey;

      if (event.shiftKey && (canHaveMultipleSelection || checkboxSelection)) {
        expandRowRangeSelection(params.id);
      } else {
        // Without checkboxSelection, multiple selection is only allowed if CTRL is pressed
        const isMultipleSelectionDisabled = !checkboxSelection && !hasCtrlKey;
        const resetSelection = !canHaveMultipleSelection || isMultipleSelectionDisabled;

        if (resetSelection) {
          apiRef.current.selectRow(
            params.id,
            hasCtrlKey || checkboxSelection ? !apiRef.current.isRowSelected(params.id) : true,
            true,
          );
        } else {
          apiRef.current.selectRow(params.id, !apiRef.current.isRowSelected(params.id), false);
        }
      }
    },
    [
      apiRef,
      expandRowRangeSelection,
      canHaveMultipleSelection,
      disableSelectionOnClick,
      checkboxSelection,
    ],
  );

  const preventSelectionOnShift = React.useCallback(
    (params: GridCellParams, event: React.MouseEvent) => {
      if (canHaveMultipleSelection && event.shiftKey) {
        window.getSelection()?.removeAllRanges();
      }
    },
    [canHaveMultipleSelection],
  );

  const handleRowSelectionCheckboxChange = React.useCallback(
    (params: GridRowSelectionCheckboxParams, event: React.ChangeEvent) => {
      if ((event.nativeEvent as any).shiftKey) {
        expandRowRangeSelection(params.id);
      } else {
        apiRef.current.selectRow(params.id, params.value);
      }
    },
    [apiRef, expandRowRangeSelection],
  );

  useGridApiEventHandler(apiRef, GridEvents.rowClick, handleRowClick);
  useGridApiEventHandler(
    apiRef,
    GridEvents.rowSelectionCheckboxChange,
    handleRowSelectionCheckboxChange,
  );
  useGridApiEventHandler(apiRef, GridEvents.cellMouseDown, preventSelectionOnShift);

  const selectionApi: GridSelectionApi = {
    selectRow,
    selectRows,
    selectRowRange,
    setSelectionModel,
    getSelectedRows,
    isRowSelected,
  };
  useGridApiMethod(apiRef, selectionApi, 'GridSelectionApi');

  React.useEffect(() => {
    apiRef.current.updateControlState<GridRowId[]>({
      stateId: 'selection',
      propModel: propSelectionModel,
      propOnChange: props.onSelectionModelChange,
      stateSelector: gridSelectionStateSelector,
      changeEvent: GridEvents.selectionChange,
    });
  }, [apiRef, props.onSelectionModelChange, propSelectionModel]);

  React.useEffect(() => {
    // Rows changed
    const currentSelection = gridSelectionStateSelector(apiRef.current.state);

    // We clone the existing object to avoid mutating the same object returned by the selector to others part of the project
    const selectionLookup = { ...selectedIdsLookupSelector(apiRef.current.state) };

    let hasChanged = false;
    currentSelection.forEach((id: GridRowId) => {
      if (!rowsLookup[id]) {
        delete selectionLookup[id];
        hasChanged = true;
      }
    });

    if (hasChanged) {
      apiRef.current.setSelectionModel(Object.values(selectionLookup));
    }
  }, [rowsLookup, apiRef]);

  React.useEffect(() => {
    if (propSelectionModel === undefined) {
      return;
    }

    apiRef.current.setSelectionModel(propSelectionModel);
  }, [apiRef, propSelectionModel]);

  React.useEffect(() => {
    // isRowSelectable changed
    const currentSelection = gridSelectionStateSelector(apiRef.current.state);

    if (isRowSelectable) {
      const newSelection = currentSelection.filter((id) =>
        isRowSelectable(apiRef.current.getRowParams(id)),
      );

      if (newSelection.length < currentSelection.length) {
        apiRef.current.setSelectionModel(newSelection);
      }
    }
  }, [apiRef, isRowSelectable]);
};
