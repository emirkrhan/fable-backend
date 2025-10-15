# 🚀 Backend Board Patches API - Frontend Integration Guide

## ⚠️ Kritik Problem: Neden Değişiklikler Eski Haline Dönüyor?

Eğer frontend'de bir değişiklik yapıyorsanız ve birkaç saniye sonra eski haline dönüyorsa, **muhtemelen aşağıdaki sebeplerden biri söz konusudur**:

### 1. **WebSocket Event'leri Yanlış Dinleniyor**
Backend'den gelen `board:patch` event'ini doğru handle etmiyorsunuz veya kendi yaptığınız değişikliği tekrar uygulamaya çalışıyorsunuz.

### 2. **Local State ile Server State Senkronizasyon Hatası**
React Flow state'inizi güncelledikten sonra, server'dan gelen response'u yanlış işliyorsunuz.

### 3. **Optimistic Update Doğru Yapılmamış**
Optimistic update yaptıktan sonra, server response'unu beklemeden başka bir request atıyorsunuz veya rollback yapmıyorsunuz.

---

## 📡 Backend API Endpoint

```
POST /api/boards/:boardId/patches
```

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

---

## 📤 Request Format

Backend **sadece değişiklikleri (incremental patches)** kabul ediyor. Tüm board'u göndermiyorsunuz!

### Request Body
```json
{
  "changes": [
    {
      "type": "addNode",
      "node": {
        "id": "node-uuid",
        "type": "custom",
        "position": { "x": 100, "y": 200 },
        "data": { "label": "My Node" }
      }
    },
    {
      "type": "updateNode",
      "id": "existing-node-id",
      "data": {
        "position": { "x": 150, "y": 250 },
        "data": { "label": "Updated Label" }
      }
    },
    {
      "type": "deleteNode",
      "id": "node-to-delete"
    },
    {
      "type": "addEdge",
      "edge": {
        "id": "edge-uuid",
        "source": "node-1",
        "target": "node-2",
        "type": "default"
      }
    },
    {
      "type": "updateEdge",
      "id": "existing-edge-id",
      "data": {
        "data": { "label": "Updated Edge" }
      }
    },
    {
      "type": "deleteEdge",
      "id": "edge-to-delete"
    }
  ]
}
```

### Change Types ve Şemaları

#### 1. `addNode`
```typescript
{
  type: "addNode",
  node: {
    id: string,           // Required: unique node ID
    type?: string,        // Node type (default, input, output, custom, etc.)
    position: {           // Required
      x: number,
      y: number
    },
    data: any,           // Your custom node data
    dimensions?: {       // Optional
      width: number,
      height: number
    }
  }
}
```

#### 2. `updateNode`
```typescript
{
  type: "updateNode",
  id: string,           // Required: ID of node to update
  data: {
    position?: {        // Optional: update position
      x: number,
      y: number
    },
    dimensions?: {      // Optional: update dimensions
      width: number,
      height: number
    },
    data?: any         // Optional: merge with existing data (deep merge)
  }
}
```

#### 3. `deleteNode`
```typescript
{
  type: "deleteNode",
  id: string           // Required: ID of node to delete
}
```

#### 4. `addEdge`
```typescript
{
  type: "addEdge",
  edge: {
    id: string,        // Required: unique edge ID
    source: string,    // Required: source node ID
    target: string,    // Required: target node ID
    type?: string,     // Edge type
    data?: any        // Your custom edge data
  }
}
```

#### 5. `updateEdge`
```typescript
{
  type: "updateEdge",
  id: string,          // Required: ID of edge to update
  data: {
    data?: any        // Merge with existing data (deep merge)
  }
}
```

#### 6. `deleteEdge`
```typescript
{
  type: "deleteEdge",
  id: string          // Required: ID of edge to delete
}
```

---

## 📥 Response Format (YENİ - OPTİMİZE EDİLDİ!)

Backend artık **sadece uygulanan değişiklikleri** döndürüyor (tüm board'u değil):

```json
{
  "id": "board-uuid",
  "updatedAt": "2025-10-13T12:34:56.789Z",
  "changes": {
    "addedNodes": [
      { "id": "node-1", "position": { "x": 100, "y": 200 }, "data": {...} }
    ],
    "updatedNodes": [
      { "id": "node-2", "position": { "x": 150, "y": 250 }, "data": {...} }
    ],
    "deletedNodeIds": ["node-3"],
    "addedEdges": [
      { "id": "edge-1", "source": "node-1", "target": "node-2" }
    ],
    "updatedEdges": [
      { "id": "edge-2", "data": {...} }
    ],
    "deletedEdgeIds": ["edge-3"]
  }
}
```

---

## 🔄 WebSocket Events

Backend, değişiklikleri diğer kullanıcılara **WebSocket ile broadcast** ediyor.

### Event: `board:patch`

```typescript
socket.on('board:patch', (data) => {
  // data = {
  //   boardId: string,
  //   userId: string,      // ✅ Değişikliği yapan user ID (echo prevention için)
  //   changes: { addedNodes, updatedNodes, deletedNodeIds, ... },
  //   updatedAt: string
  // }
})
```

**ÖNEMLİ:** Kendi yaptığınız değişikliği tekrar uygulamayın! `userId` kullanarak filter edin.

---

## ✅ Frontend Implementation Guide (React Flow + Next.js)

### 🎯 Temel Prensipler

1. **Optimistic Update Kullanın**: Kullanıcı deneyimi için önce local state'i güncelleyin
2. **Debounce/Throttle Kullanın**: Her küçük değişiklikte API'ye istek atmayın
3. **Change Queue**: Birden fazla değişikliği toplayıp tek seferde gönderin
4. **WebSocket Sync**: Diğer kullanıcıların değişikliklerini doğru uygulayın
5. **Conflict Resolution**: Kendi değişikliğinizi WebSocket'ten gelen ile karıştırmayın

---

### 📝 Örnek Implementation Pattern

```typescript
// 1. Change Queue ve Debounce Setup
const [changeQueue, setChangeQueue] = useState<Change[]>([]);
const [isSyncing, setIsSyncing] = useState(false);

// Debounced save function
const debouncedSave = useMemo(
  () => debounce(async (changes: Change[]) => {
    if (changes.length === 0) return;

    setIsSyncing(true);
    try {
      const response = await fetch(`/api/boards/${boardId}/patches`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ changes })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Patch failed:', error);
        // ROLLBACK: Eski state'e dön
        fetchFullBoard(); // veya local'den restore et
        return;
      }

      const result = await response.json();
      // Success: Queue'yu temizle
      setChangeQueue([]);

    } catch (error) {
      console.error('Patch error:', error);
      // ROLLBACK: Eski state'e dön
      fetchFullBoard();
    } finally {
      setIsSyncing(false);
    }
  }, 500), // 500ms debounce
  [boardId, token]
);

// 2. React Flow Event Handlers
const onNodesChange = useCallback((changes: NodeChange[]) => {
  // Optimistic update: Önce local state'i güncelle
  setNodes((nds) => applyNodeChanges(changes, nds));

  // Convert React Flow changes to backend format
  const backendChanges = changes.map(change => {
    if (change.type === 'position' && change.dragging === false) {
      return {
        type: 'updateNode',
        id: change.id,
        data: {
          position: change.position
        }
      };
    }
    // ... diğer change type'lar
  }).filter(Boolean);

  // Add to queue
  setChangeQueue(prev => [...prev, ...backendChanges]);
}, []);

// 3. Queue değiştiğinde debounced save çalıştır
useEffect(() => {
  if (changeQueue.length > 0) {
    debouncedSave(changeQueue);
  }
}, [changeQueue, debouncedSave]);

// 4. WebSocket handling
useEffect(() => {
  const socket = io(process.env.NEXT_PUBLIC_WS_URL);

  socket.emit('join-board', boardId);

  socket.on('board:patch', (data: PatchEvent) => {
    // ÖNEMLİ: Sadece diğer kullanıcıların değişikliklerini uygula
    if (data.boardId !== boardId) return;

    // ✅ Echo Prevention: Kendi değişikliğini ignore et
    const currentUserId = getCurrentUserId(); // veya state'ten al
    if (data.userId === currentUserId) return;

    setNodes((currentNodes) => {
      let updated = [...currentNodes];

      // Apply added nodes
      data.changes.addedNodes.forEach(node => {
        if (!updated.find(n => n.id === node.id)) {
          updated.push(node);
        }
      });

      // Apply updated nodes
      data.changes.updatedNodes.forEach(updatedNode => {
        updated = updated.map(node =>
          node.id === updatedNode.id
            ? { ...node, ...updatedNode }
            : node
        );
      });

      // Apply deleted nodes
      updated = updated.filter(
        node => !data.changes.deletedNodeIds.includes(node.id)
      );

      return updated;
    });

    // Aynı şekilde edges için de uygula
    setEdges((currentEdges) => {
      // ... similar logic for edges
    });
  });

  return () => {
    socket.emit('leave-board', boardId);
    socket.disconnect();
  };
}, [boardId]);
```

---

## 🐛 Debug Checklist

Eğer değişiklikler eski haline dönüyorsa, şunları kontrol edin:

### ✅ 1. API Request'ler
```bash
# Browser console'da network tab'inde kontrol edin:
# - Request body doğru mu?
# - Response 200 OK mi?
# - Response body'de changes var mı?
```

### ✅ 2. WebSocket Events
```typescript
socket.on('board:patch', (data) => {
  console.log('🔄 Received patch:', data);
  // Bu sizin değişikliğiniz mi yoksa başka kullanıcının mı?
});
```

### ✅ 3. React State Updates
```typescript
// State update'lerini logla
setNodes((prev) => {
  console.log('📝 Updating nodes:', prev.length);
  return newNodes;
});
```

### ✅ 4. Duplicate Changes
```typescript
// Aynı node için birden fazla update gönderiyor musunuz?
console.log('📤 Sending changes:', changeQueue);
```

### ✅ 5. Race Conditions
```typescript
// Birden fazla request aynı anda atılıyor mu?
if (isSyncing) {
  console.warn('⚠️ Already syncing, skipping...');
  return;
}
```

---

## 🚨 Yaygın Hatalar ve Çözümleri

### ❌ Hata 1: Tüm Board'u Gönderiyorsunuz
```typescript
// YANLIŞ ❌
fetch('/api/boards/xxx/patches', {
  body: JSON.stringify({
    changes: [{ type: 'updateNode', node: entireNode }] // YANLIŞ!
  })
});

// DOĞRU ✅
fetch('/api/boards/xxx/patches', {
  body: JSON.stringify({
    changes: [{
      type: 'updateNode',
      id: 'node-id',
      data: { position: { x: 100, y: 200 } } // Sadece değişen kısım
    }]
  })
});
```

### ❌ Hata 2: WebSocket'ten Gelen Kendi Değişikliğinizi Tekrar Uyguluyorsunuz
```typescript
// YANLIŞ ❌
socket.on('board:patch', (data) => {
  // Her event'i körü körüne uyguluyorsunuz
  applyChanges(data.changes);
});

// DOĞRU ✅
socket.on('board:patch', (data) => {
  // ✅ userId ile echo prevention
  if (data.userId === currentUserId) return;

  // Sadece diğer kullanıcıların değişikliklerini uygula
  applyChanges(data.changes);
});
```

### ❌ Hata 3: Debounce Kullanmıyorsunuz
```typescript
// YANLIŞ ❌
onNodeDrag={(event, node) => {
  // Her pixel'de API request! 💣
  sendPatch({ type: 'updateNode', id: node.id, ... });
}}

// DOĞRU ✅
onNodeDragStop={(event, node) => {
  // Sadece drag bittiğinde
  sendPatch({ type: 'updateNode', id: node.id, ... });
}}
```

### ❌ Hata 4: Optimistic Update Yapmadan Bekliyorsunuz
```typescript
// YANLIŞ ❌ (Laggy UX)
await sendPatch(change);
setNodes(newNodes); // Server'ı bekliyor

// DOĞRU ✅ (Smooth UX)
setNodes(newNodes); // Önce local update
await sendPatch(change); // Sonra sync
```

---

## 🔐 Validation Rules (Backend)

Backend aşağıdaki validasyonları yapıyor:

1. **changes array required**: Boş array gönderilemez
2. **Valid change types**: Sadece 6 tür destekleniyor
3. **Required fields**: Her change type için gerekli alanlar kontrol ediliyor
4. **Duplicate consolidation**: Aynı entity için birden fazla change varsa, backend sadece sonuncusunu uygular

### Hata Örnekleri
```json
// 400 Bad Request
{
  "error": "Validation failed: addNode requires a node object"
}

{
  "error": "Invalid change type: modifyNode. Must be one of: addNode, updateNode, deleteNode, addEdge, updateEdge, deleteEdge"
}
```

---

## 🎯 Performance Tips

1. **Batch Updates**: 500ms içindeki tüm değişiklikleri tek request'te gönderin
2. **Skip Insignificant Changes**: 1px'den az position değişikliklerini göndermek gereksiz
3. **WebSocket Throttling**: Çok fazla event geliyorsa throttle kullanın
4. **Local Cache**: Full board fetch'i minimize edin, patches ile sync yapın

---

## 📊 Backend Performance Characteristics

- **O(1) Lookup**: Map/Set kullanımı ile node/edge lookup
- **Transaction Safety**: PostgreSQL transaction ile data integrity
- **Row-Level Locking**: Concurrent updates güvenli
- **Change Consolidation**: Duplicate changes otomatik olarak merge ediliyor
- **Minimal Response**: Sadece applied changes döndürülüyor (full board değil)

---

## 🎬 Sonuç

**Değişikliklerin eski haline dönmesinin en yaygın sebepleri:**

1. WebSocket'ten gelen event'leri yanlış handle etmek
2. Optimistic update sonrası rollback yapmamak
3. Server response'unu local state ile yanlış merge etmek
4. Debounce kullanmadan çok fazla request atmak
5. Request/response format'ını yanlış kullanmak

**Bu guide'ı takip ederseniz:**
- ✅ Performanslı bir sync sistemi olur
- ✅ Kullanıcı deneyimi smooth olur
- ✅ Concurrent editing sorunsuz çalışır
- ✅ Backend yükü minimal olur

---

**Backend iletişim için:** Bu sistemde herhangi bir sorun varsa veya yeni feature ihtiyacınız varsa backend ekibine bildirin.
