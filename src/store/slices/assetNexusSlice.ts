import { DataGateway } from '../../application/DataGateway';
import { isSystemGeneralMachine } from '../../utils/activeMachines';
import { safeId } from '../../utils/safeId';
import { buildUnifiedMachineNexusElements } from '../../core/domain/Blueprint';
import type { GmaoStoreState, MachineElement, StateUpdater } from '../../types/store';
import type {
  IMachine,
  IMachineFamily,
  IMachineTemplate,
  IBlueprint,
  IGeneralSystemType,
  IZone,
  IWarehouseItem,
  IEntrepotComponent,
  ICompGroup,
  ICompFamily,
  ICompTemplate,
  IPartGroup,
  IPartType,
  IPartDesignation,
  IUserRecord,
  ITechnician,
  IOperation,
} from '../../types/domain';
import {
  resolveUpdate,
  trackRemovedEntityIds,
  isMachineArchivedState,
  normalizeMachinesList,
  getInitialMachines,
  getInitialWarehouse,
  getInitialPersonnel,
} from './storeBootstrapSlice';

type StoreSet = (
  partial: Partial<GmaoStoreState> | ((state: GmaoStoreState) => Partial<GmaoStoreState>)
) => void;
type StoreGet = () => GmaoStoreState;

export type AssetNexusSliceKeys = Pick<
  GmaoStoreState,
  | 'families'
  | 'templates'
  | 'blueprints'
  | 'machines'
  | 'generalSystemTypes'
  | 'zones'
  | 'machineElementsLedger'
  | 'setFamilies'
  | 'setTemplates'
  | 'setBlueprints'
  | 'setMachines'
  | 'setGeneralSystemTypes'
  | 'handleAddGeneralSystemType'
  | 'handleToggleGeneralSystemType'
  | 'setZones'
  | 'setMachineElementsLedger'
  | 'addMachineElement'
  | 'updateMachineElement'
  | 'upsertMachineElementsBatch'
  | 'updateMachineElementsBatch'
  | 'deleteMachineElement'
  | 'duplicateBOMToTwins'
  | 'isValidMachineFamilies'
  | 'isValidMachineTemplates'
  | 'warehouseItems'
  | 'entrepotComponents'
  | 'compGroups'
  | 'compFamilies'
  | 'compTemplates'
  | 'partGroups'
  | 'partTypes'
  | 'partDesignations'
  | 'setWarehouseItems'
  | 'setEntrepotComponents'
  | 'setCompGroups'
  | 'setCompFamilies'
  | 'setCompTemplates'
  | 'setPartGroups'
  | 'setPartTypes'
  | 'setPartDesignations'
  | 'users'
  | 'technicians'
  | 'operations'
  | 'setUsers'
  | 'setTechnicians'
  | 'setOperations'
>;

export function createAssetNexusSlice(set: StoreSet, get: StoreGet): AssetNexusSliceKeys {
  const initialMachines = getInitialMachines();
  const initialWarehouse = getInitialWarehouse();
  const initialPersonnel = getInitialPersonnel();

  return {
    families: initialMachines.families as IMachineFamily[],
    templates: initialMachines.templates as IMachineTemplate[],
    blueprints: initialMachines.blueprints as IBlueprint[],
    machines: initialMachines.machines as IMachine[],
    generalSystemTypes: initialMachines.generalSystemTypes as IGeneralSystemType[],
    zones: initialMachines.zones as IZone[],
    machineElementsLedger: initialMachines.machineElementsLedger as MachineElement[],

    setFamilies: (updater: StateUpdater<IMachineFamily[]>) => {
      const prev = get().families || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('families', prev, next);
      DataGateway.saveFamilies(next);
      set({ families: next });
    },

    setTemplates: (updater: StateUpdater<IMachineTemplate[]>) => {
      const prev = get().templates || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('templates', prev, next);
      DataGateway.saveTemplates(next);
      set({ templates: next });
    },

    setBlueprints: (updater: StateUpdater<IBlueprint[]>) => {
      const prev = get().blueprints || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('blueprints', prev, next);
      DataGateway.saveBlueprints(next);
      set({ blueprints: next });
    },

    setMachines: (updater: StateUpdater<IMachine[]>) => {
      const prev = get().machines || [];
      const rawNext = resolveUpdate(updater, prev);
      const next = normalizeMachinesList(rawNext) as IMachine[];
      trackRemovedEntityIds('machines', prev, next);

      // Institutional append-only audit for archive/restore lifecycle transitions
      if (prev.length > 0 && typeof get().appendAuditEvent === 'function') {
        const prevById = new Map<string, IMachine>();
        for (const m of prev) {
          const id = String(m?.id_machine_registered || m?.id || m?.code || '').trim();
          if (id) prevById.set(id.toUpperCase(), m);
        }
        for (const m of next) {
          const id = String(m?.id_machine_registered || m?.id || m?.code || '').trim();
          if (!id) continue;
          const oldMachine = prevById.get(id.toUpperCase());
          if (!oldMachine) continue;

          const wasArchived = isMachineArchivedState(oldMachine);
          const isArchived = isMachineArchivedState(m);
          if (wasArchived !== isArchived) {
            get().appendAuditEvent({
              actionType: isArchived ? 'MACHINE_ARCHIVED' : 'MACHINE_RESTORED',
              entityType: 'MACHINE',
              entityId: id,
              before: {
                is_active: oldMachine.is_active !== false && !wasArchived,
                status: oldMachine.status || oldMachine.statut || '',
              },
              after: {
                is_active: m.is_active !== false && !isArchived,
                status: m.status || m.statut || '',
              },
            });
          }
        }
      }

      DataGateway.saveMachines(next);
      set({ machines: next });
    },

    setGeneralSystemTypes: (updater: StateUpdater<IGeneralSystemType[]>) => {
      const prev = get().generalSystemTypes || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('generalSystemTypes', prev, next);
      DataGateway.saveGeneralSystemTypes(next);
      set({ generalSystemTypes: next });
    },

    handleAddGeneralSystemType: (payload: { name: string; code?: string; id?: string }) => {
      const cleanName = String(payload?.name || '').trim();
      if (!cleanName) return null;
      const cleanCode = String(
        payload?.code ||
          cleanName
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 3)
            .toUpperCase() ||
          'SYS'
      )
        .trim()
        .toUpperCase();
      const id = String(payload?.id || `SYS-${cleanCode}`).trim();
      const existing = get().generalSystemTypes || [];
      const duplicate = existing.find(
        (t) =>
          String(t.id || '').toUpperCase() === id.toUpperCase() ||
          String(t.code || '').toUpperCase() === cleanCode
      );
      if (duplicate) return duplicate;

      const created: IGeneralSystemType = {
        id,
        code: cleanCode,
        name: cleanName,
        is_active: true,
      };
      get().setGeneralSystemTypes((prev) => [...(prev || []), created]);
      get().appendAuditEvent?.({
        actionType: 'GENERAL_SYSTEM_TYPE_CREATED',
        entityType: 'GENERAL_SYSTEM_TYPE',
        entityId: created.id,
        before: null,
        after: created,
      });
      return created;
    },

    handleToggleGeneralSystemType: (id: string, isActive?: boolean) => {
      const existing = (get().generalSystemTypes || []).find(
        (t) => String(t.id) === String(id)
      );
      if (!existing) return;
      const wasActive = existing.is_active !== false;
      const nextActive = typeof isActive === 'boolean' ? isActive : !wasActive;
      get().setGeneralSystemTypes((prev) =>
        (prev || []).map((t) => {
          if (String(t.id) !== String(id)) return t;
          return { ...t, is_active: nextActive };
        })
      );
      get().appendAuditEvent?.({
        actionType: 'GENERAL_SYSTEM_TYPE_TOGGLED',
        entityType: 'GENERAL_SYSTEM_TYPE',
        entityId: String(existing.id),
        before: { is_active: wasActive },
        after: { is_active: nextActive },
      });
    },

    setZones: (updater: StateUpdater<IZone[]>) => {
      const prev = get().zones || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('zones', prev, next);
      DataGateway.saveZones(next);
      set({ zones: next });
    },

    setMachineElementsLedger: (updater: StateUpdater<MachineElement[]>) => {
      const prev = get().machineElementsLedger || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('machineElementsLedger', prev, next);
      DataGateway.saveMachineBom(next);
      set({ machineElementsLedger: next });
    },

    addMachineElement: (element: Partial<MachineElement>) => {
      if (!element || typeof element !== 'object') return;
      const targetMachKey = String(element.id_machine_registered || '').trim().toUpperCase();
      if (targetMachKey) {
        const matchedMachine = (get().machines || []).find(
          (m) =>
            String(m.id_machine_registered || m.id || m.code || '')
              .trim()
              .toUpperCase() === targetMachKey
        );
        if (matchedMachine && isSystemGeneralMachine(matchedMachine)) {
          return;
        }
      }

      const created: MachineElement = {
        ...element,
        id: String(element.id || safeId('BOM')).trim(),
      };
      get().setMachineElementsLedger((prev) => [created, ...(prev || [])]);
      get().appendAuditEvent?.({
        actionType: 'MACHINE_BOM_ELEMENT_ADDED',
        entityType: 'MACHINE',
        entityId: targetMachKey || String(created.id),
        before: null,
        after: {
          elementId: created.id,
          element_type: created.element_type,
          ref_element: created.ref_element || created.id_element,
          designation: created.designation || created.nom_element,
          qte_montee: created.qte_montee,
        },
      });
    },

    updateMachineElement: (id: string, updates: Partial<MachineElement>) => {
      const existing = (get().machineElementsLedger || []).find(
        (el) => String(el.id) === String(id)
      );
      get().setMachineElementsLedger((prev) =>
        (prev || []).map((el) => (String(el.id) === String(id) ? { ...el, ...updates } : el))
      );
      if (existing) {
        get().appendAuditEvent?.({
          actionType: 'MACHINE_BOM_ELEMENT_UPDATED',
          entityType: 'MACHINE',
          entityId: String(existing.id_machine_registered || id).trim(),
          before: {
            elementId: existing.id,
            ref_element: existing.ref_element || existing.id_element,
            qte_montee: existing.qte_montee,
            statut: existing.statut,
          },
          after: {
            elementId: existing.id,
            ref_element: updates.ref_element ?? existing.ref_element ?? existing.id_element,
            qte_montee: updates.qte_montee ?? existing.qte_montee,
            statut: updates.statut ?? existing.statut,
          },
        });
      }
    },

    upsertMachineElementsBatch: (
      elements: Partial<MachineElement>[],
      options?: { sourceLabel?: string }
    ) => {
      if (!Array.isArray(elements) || elements.length === 0) {
        return { addedCount: 0, updatedCount: 0, skippedSystemCount: 0 };
      }

      const machines = get().machines || [];
      const currentLedger = [...(get().machineElementsLedger || [])];
      const indexByPair = new Map<string, number>();
      const indexById = new Map<string, number>();

      const buildPairKey = (machRaw: unknown, refRaw: unknown) => {
        const m = String(machRaw || '').trim().toUpperCase();
        const r = String(refRaw || '').trim().toUpperCase();
        return m && r ? `${m}::${r}` : '';
      };

      currentLedger.forEach((el, idx) => {
        if (!el) return;
        const idKey = String(el.id || '').trim();
        if (idKey) indexById.set(idKey, idx);
        const pairKey = buildPairKey(
          el.id_machine_registered,
          el.ref_element || el.id_element || el.ref
        );
        if (pairKey && !indexByPair.has(pairKey)) {
          indexByPair.set(pairKey, idx);
        }
      });

      let addedCount = 0;
      let updatedCount = 0;
      let skippedSystemCount = 0;
      const newRecordsToPrepend: MachineElement[] = [];
      const pendingNewIndexByPair = new Map<string, number>();
      const affectedMachines = new Set<string>();

      for (const candidate of elements) {
        if (!candidate || typeof candidate !== 'object') continue;
        const targetMachRaw = String(candidate.id_machine_registered || '').trim();
        const targetMachKey = targetMachRaw.toUpperCase();
        if (targetMachKey) {
          const matchedMachine = machines.find(
            (m) =>
              String(m.id_machine_registered || m.id || m.code || '')
                .trim()
                .toUpperCase() === targetMachKey
          );
          if (matchedMachine && isSystemGeneralMachine(matchedMachine)) {
            skippedSystemCount++;
            continue;
          }
          affectedMachines.add(targetMachKey);
        }

        const refRaw = String(
          candidate.ref_element || candidate.id_element || candidate.ref || ''
        ).trim();
        const pairKey = buildPairKey(targetMachRaw, refRaw);
        const explicitId = String(candidate.id || '').trim();

        const existingIdxById = explicitId ? indexById.get(explicitId) : undefined;
        const existingIdxByPair = pairKey ? indexByPair.get(pairKey) : undefined;
        const existingIdx =
          existingIdxById !== undefined ? existingIdxById : existingIdxByPair;

        if (existingIdx !== undefined) {
          const prevEl = currentLedger[existingIdx];
          currentLedger[existingIdx] = {
            ...prevEl,
            ...candidate,
            id: prevEl.id,
          };
          updatedCount++;
          continue;
        }

        // Also deduplicate duplicate (Machine + Ref) rows inside the same incoming batch
        if (pairKey && pendingNewIndexByPair.has(pairKey)) {
          const newIdx = pendingNewIndexByPair.get(pairKey)!;
          const prevNew = newRecordsToPrepend[newIdx];
          newRecordsToPrepend[newIdx] = {
            ...prevNew,
            ...candidate,
            id: prevNew.id,
          };
          updatedCount++;
          continue;
        }

        const created: MachineElement = {
          ...candidate,
          id: explicitId || safeId('BOM'),
        };
        const newIdx = newRecordsToPrepend.length;
        newRecordsToPrepend.push(created);
        if (pairKey) {
          pendingNewIndexByPair.set(pairKey, newIdx);
        }
        addedCount++;
      }

      if (addedCount > 0 || updatedCount > 0) {
        const nextLedger = [...newRecordsToPrepend, ...currentLedger];
        get().setMachineElementsLedger(nextLedger);
        get().appendAuditEvent?.({
          actionType: 'MACHINE_BOM_BATCH_UPSERTED',
          entityType: 'MACHINE',
          entityId:
            affectedMachines.size === 1
              ? Array.from(affectedMachines)[0]
              : 'BATCH_BOM',
          before: null,
          after: {
            source: options?.sourceLabel || 'BATCH_UPSERT',
            addedCount,
            updatedCount,
            skippedSystemCount,
            machines: Array.from(affectedMachines),
          },
        });
      }

      return { addedCount, updatedCount, skippedSystemCount };
    },

    updateMachineElementsBatch: (
      updatesList: Array<{ id: string; updates: Partial<MachineElement> }>,
      options?: { sourceLabel?: string }
    ) => {
      if (!Array.isArray(updatesList) || updatesList.length === 0) {
        return { updatedCount: 0 };
      }

      const updatesById = new Map<string, Partial<MachineElement>>();
      for (const item of updatesList) {
        const cleanId = String(item?.id || '').trim();
        if (!cleanId || !item?.updates) continue;
        const prev = updatesById.get(cleanId) || {};
        updatesById.set(cleanId, { ...prev, ...item.updates });
      }
      if (updatesById.size === 0) {
        return { updatedCount: 0 };
      }

      let updatedCount = 0;
      const affectedMachines = new Set<string>();
      const nextLedger = (get().machineElementsLedger || []).map((el) => {
        const cleanId = String(el?.id || '').trim();
        const patch = updatesById.get(cleanId);
        if (!patch) return el;
        updatedCount++;
        const machKey = String(el.id_machine_registered || '').trim().toUpperCase();
        if (machKey) affectedMachines.add(machKey);
        return { ...el, ...patch };
      });

      if (updatedCount > 0) {
        get().setMachineElementsLedger(nextLedger);
        get().appendAuditEvent?.({
          actionType: 'MACHINE_BOM_BATCH_UPDATED',
          entityType: 'MACHINE',
          entityId:
            affectedMachines.size === 1
              ? Array.from(affectedMachines)[0]
              : 'BATCH_BOM',
          before: null,
          after: {
            source: options?.sourceLabel || 'BATCH_UPDATE',
            updatedCount,
            machines: Array.from(affectedMachines),
          },
        });
      }

      return { updatedCount };
    },

    deleteMachineElement: (id: string) => {
      const existing = (get().machineElementsLedger || []).find(
        (el) => String(el.id) === String(id)
      );
      get().setMachineElementsLedger((prev) =>
        (prev || []).filter((el) => String(el.id) !== String(id))
      );
      if (existing) {
        get().appendAuditEvent?.({
          actionType: 'MACHINE_BOM_ELEMENT_DELETED',
          entityType: 'MACHINE',
          entityId: String(existing.id_machine_registered || id).trim(),
          before: {
            elementId: existing.id,
            element_type: existing.element_type,
            ref_element: existing.ref_element || existing.id_element,
            designation: existing.designation || existing.nom_element,
          },
          after: null,
        });
      }
    },

    duplicateBOMToTwins: (sourceMachineId: string, targetMachineIds: string[]) => {
      const srcKey = String(sourceMachineId || '').trim().toUpperCase();
      if (!srcKey || !Array.isArray(targetMachineIds) || targetMachineIds.length === 0) return 0;

      const ledger = get().machineElementsLedger || [];
      const warehouseItems = get().warehouseItems || [];
      const machines = get().machines || [];
      const today = new Date().toISOString().split('T')[0];

      // Build unified source BOM (LEDGER + mounted ENTREPOT items)
      const sourceElements = buildUnifiedMachineNexusElements(
        sourceMachineId,
        ledger,
        warehouseItems
      );
      if (sourceElements.length === 0) return 0;

      const newEntries: MachineElement[] = [];

      for (const targetId of targetMachineIds) {
        const cleanTarget = String(targetId || '').trim();
        const targetKey = cleanTarget.toUpperCase();
        if (!targetKey || targetKey === srcKey) continue;

        const targetMachine = machines.find(
          (m) =>
            String(m.id_machine_registered || m.id || m.code || '')
              .trim()
              .toUpperCase() === targetKey
        );
        if (targetMachine && isSystemGeneralMachine(targetMachine)) continue;

        // Collect all refs and catalog template IDs already mounted on target twin (LEDGER + ENTREPOT)
        const targetExistingElements = buildUnifiedMachineNexusElements(
          cleanTarget,
          ledger,
          warehouseItems
        );
        const targetExistingKeys = new Set<string>();
        for (const existing of targetExistingElements) {
          const candidates = [
            existing.ref_element,
            existing.id_element,
            existing._compTemplateId,
            existing._partDesignationId,
          ];
          for (const c of candidates) {
            const norm = String(c || '').trim().toUpperCase();
            if (norm) targetExistingKeys.add(norm);
          }
        }

        const targetCounter = Number(
          (targetMachine as any)?.compteur_actuel ?? (targetMachine as any)?.compteur ?? 0
        );
        const targetTech = String(
          targetMachine?.technician ||
            targetMachine?.technicien_responsable ||
            targetMachine?.technicien ||
            ''
        ).trim();

        for (const srcEl of sourceElements) {
          if (srcEl._source === 'ENTREPOT') {
            // Never clone a physical serialized warehouse ID onto a twin; clone only at catalog/template level
            const templateRef = String(
              srcEl._compTemplateId || srcEl._partDesignationId || ''
            ).trim();
            const templateKey = templateRef.toUpperCase();
            if (!templateKey || targetExistingKeys.has(templateKey)) continue;
            targetExistingKeys.add(templateKey);

            const cleanClone: MachineElement = {
              id: safeId('BOM'),
              id_machine_registered: cleanTarget,
              element_type: srcEl.element_type || 'COMPONENT',
              ref_element: templateRef,
              designation: srcEl.designation || templateRef,
              qte_montee: Math.max(1, Number(srcEl.qte_montee) || 1),
              unite: srcEl.unite || 'U',
              criticalite: srcEl.criticalite || 'CRITIQUE',
              duree_vie_estimee_heures: Number(srcEl.duree_vie_estimee_heures) || 10000,
              heures_actuelles: 0,
              date_installation: today,
              emplacement_machine: srcEl.emplacement_machine || '',
              parent_component_key: srcEl.parent_component_key || '',
              technicien: targetTech || srcEl.technicien || '',
              statut: 'OPERATIONNEL',
              remarques: srcEl.remarques || '',
              ...(Number.isFinite(targetCounter) && targetCounter > 0
                ? { compteur_installation: targetCounter }
                : {}),
            };
            newEntries.push(cleanClone);
            continue;
          }

          const refRaw = String(srcEl.ref_element || srcEl.id_element || '').trim();
          const refKey = refRaw.toUpperCase();
          if (!refKey || targetExistingKeys.has(refKey)) continue;
          targetExistingKeys.add(refKey);

          const {
            _source: _omitSource,
            _warehouseItemId: _omitWhId,
            _warehouseStatus: _omitWhStatus,
            _compTemplateId: _omitCompTpl,
            _partDesignationId: _omitPartDes,
            wear_source: _omitWearSource,
            compteur_installation: _omitInstallCounter,
            ...baseFields
          } = srcEl as Record<string, unknown>;

          const cleanClone: MachineElement = {
            ...(baseFields as Partial<MachineElement>),
            id: safeId('BOM'),
            id_machine_registered: cleanTarget,
            ref_element: refRaw,
            heures_actuelles: 0,
            statut: 'OPERATIONNEL',
            date_installation: today,
            technicien: targetTech || String(srcEl.technicien || ''),
            ...(Number.isFinite(targetCounter) && targetCounter > 0
              ? { compteur_installation: targetCounter }
              : {}),
          };
          newEntries.push(cleanClone);
        }
      }

      if (newEntries.length > 0) {
        get().setMachineElementsLedger((prev) => [...newEntries, ...(prev || [])]);
        get().appendAuditEvent?.({
          actionType: 'MACHINE_BOM_DUPLICATED_TO_TWINS',
          entityType: 'MACHINE',
          entityId: srcKey,
          before: null,
          after: {
            sourceMachineId: srcKey,
            targetMachineIds,
            addedElementsCount: newEntries.length,
          },
        });
      }

      return newEntries.length;
    },

    isValidMachineFamilies: (arr: IMachineFamily[]) =>
      Array.isArray(arr) &&
      arr.every((f) => Boolean(f && (f.id_family || f.id || f.nom_famille || f.libelle))),

    isValidMachineTemplates: (arr: IMachineTemplate[]) =>
      Array.isArray(arr) &&
      arr.every((t) => Boolean(t && (t.id_templates || t.id_template || t.id || t.nom_modele))),

    warehouseItems: initialWarehouse.warehouseItems as IWarehouseItem[],
    entrepotComponents: initialWarehouse.entrepotComponents as IEntrepotComponent[],
    compGroups: initialWarehouse.compGroups as ICompGroup[],
    compFamilies: initialWarehouse.compFamilies as ICompFamily[],
    compTemplates: initialWarehouse.compTemplates as ICompTemplate[],
    partGroups: initialWarehouse.partGroups as IPartGroup[],
    partTypes: initialWarehouse.partTypes as IPartType[],
    partDesignations: initialWarehouse.partDesignations as IPartDesignation[],

    setWarehouseItems: (updater: StateUpdater<IWarehouseItem[]>) => {
      const prev = get().warehouseItems || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('warehouseItems', prev, next);
      DataGateway.saveWarehouseItems(next);
      set({ warehouseItems: next });
    },

    setEntrepotComponents: (updater: StateUpdater<IEntrepotComponent[]>) => {
      const prev = get().entrepotComponents || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('entrepotComponents', prev, next);
      DataGateway.saveEntrepotComponents(next);
      set({ entrepotComponents: next });
    },

    setCompGroups: (updater: StateUpdater<ICompGroup[]>) => {
      const prev = get().compGroups || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('compGroups', prev, next);
      DataGateway.saveCompGroups(next);
      set({ compGroups: next });
    },

    setCompFamilies: (updater: StateUpdater<ICompFamily[]>) => {
      const prev = get().compFamilies || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('compFamilies', prev, next);
      DataGateway.saveCompFamilies(next);
      set({ compFamilies: next });
    },

    setCompTemplates: (updater: StateUpdater<ICompTemplate[]>) => {
      const prev = get().compTemplates || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('compTemplates', prev, next);
      DataGateway.saveCompTemplates(next);
      set({ compTemplates: next });
    },

    setPartGroups: (updater: StateUpdater<IPartGroup[]>) => {
      const prev = get().partGroups || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('partGroups', prev, next);
      DataGateway.savePartGroups(next);
      set({ partGroups: next });
    },

    setPartTypes: (updater: StateUpdater<IPartType[]>) => {
      const prev = get().partTypes || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('partTypes', prev, next);
      DataGateway.savePartTypes(next);
      set({ partTypes: next });
    },

    setPartDesignations: (updater: StateUpdater<IPartDesignation[]>) => {
      const prev = get().partDesignations || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('partDesignations', prev, next);
      DataGateway.savePartDesignations(next);
      set({ partDesignations: next });
    },

    users: initialPersonnel.users as IUserRecord[],
    technicians: initialPersonnel.technicians as ITechnician[],
    operations: initialPersonnel.operations as IOperation[],

    setUsers: (updater: StateUpdater<IUserRecord[]>) => {
      const prev = get().users || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('users', prev, next);
      DataGateway.savePersonnel(next, get().technicians, get().operations);
      set({ users: next });
    },

    setTechnicians: (updater: StateUpdater<ITechnician[]>) => {
      const prev = get().technicians || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('technicians', prev, next);
      DataGateway.saveTechnicians(next);
      set({ technicians: next });
    },

    setOperations: (updater: StateUpdater<IOperation[]>) => {
      const prev = get().operations || [];
      const next = resolveUpdate(updater, prev);
      trackRemovedEntityIds('operations', prev, next);
      DataGateway.saveOperations(next);
      set({ operations: next });
    },
  };
}
