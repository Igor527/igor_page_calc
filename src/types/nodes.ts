// Типы для визуальных нод (Dynamo-style)

export interface NodePort {
  id: string;
  blockId: string;
  type: 'input' | 'output';
  dataType: 'number' | 'string' | 'array' | 'object' | 'any';
  label: string;
  connected: boolean;
}

export interface NodeConnection {
  id: string;
  fromBlockId: string;
  fromPort: string;
  toBlockId: string;
  toPort: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeData {
  blockId: string;
  position: NodePosition;
  ports: {
    inputs: NodePort[];
    outputs: NodePort[];
  };
}
