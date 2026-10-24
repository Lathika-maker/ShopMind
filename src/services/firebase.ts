/**
 * SHOPMIND — Firebase & Firestore Cloud Storage Service
 * Provides Firestore persistence for commercial scenarios and datasets.
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { ScenarioSimulationResult, DatasetMetadata } from '../types/retail.ts';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Must pass firestoreDatabaseId for custom provisioned databases
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection
export async function testFirestoreConnection(): Promise<{ connected: boolean; message: string; projectId: string }> {
  const path = 'test/connection';
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      connected: true,
      message: 'Active Firestore cloud storage connection verified.',
      projectId: firebaseConfig.projectId,
    };
  } catch (error: any) {
    // If document doesn't exist, getDocFromServer still successfully contacts server
    if (error?.code === 'unavailable' || (error instanceof Error && error.message.includes('client is offline'))) {
      return {
        connected: false,
        message: 'Client is offline or network unreachable.',
        projectId: firebaseConfig.projectId,
      };
    }
    return {
      connected: true,
      message: 'Connected to Firestore Cloud Storage successfully.',
      projectId: firebaseConfig.projectId,
    };
  }
}

// Persist a Scenario to Firestore
export async function saveScenarioToFirestore(scenario: ScenarioSimulationResult): Promise<void> {
  const path = `scenarios/${scenario.scenario_id}`;
  try {
    const cleanId = scenario.scenario_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    await setDoc(doc(db, 'scenarios', cleanId), {
      scenario_id: cleanId,
      name: scenario.name,
      product_id: scenario.product_id,
      product_name: scenario.product_name,
      selling_price: scenario.selling_price,
      unit_cost: scenario.unit_cost,
      discount_pct: scenario.discount_pct || 0,
      effective_price: scenario.effective_price,
      promotion_cost: scenario.promotion_cost || 0,
      advertising_cost: scenario.advertising_cost || 0,
      inventory: scenario.inventory,
      demand: scenario.demand,
      demand_source: scenario.demand_source,
      fulfilled: scenario.fulfilled,
      unmet: scenario.unmet,
      leftover: scenario.leftover,
      revenue: scenario.revenue,
      estimated_profit: scenario.estimated_profit,
      profit_margin_pct: scenario.profit_margin_pct,
      stock_out_risk_percent: scenario.stock_out_risk_percent,
      is_feasible: scenario.is_feasible,
      created_at: scenario.created_at,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Load all Scenarios from Firestore
export async function loadScenariosFromFirestore(): Promise<ScenarioSimulationResult[]> {
  const path = 'scenarios';
  try {
    const snap = await getDocs(collection(db, 'scenarios'));
    const list: ScenarioSimulationResult[] = [];
    snap.forEach((d) => {
      list.push(d.data() as ScenarioSimulationResult);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Delete Scenario from Firestore
export async function deleteScenarioFromFirestore(scenarioId: string): Promise<void> {
  const cleanId = scenarioId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `scenarios/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'scenarios', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
