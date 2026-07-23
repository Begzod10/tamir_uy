# Meshy AI Integration Guide

**Last Updated:** 2026-07-24  
**Feature:** Image-to-3D Model Conversion

---

## Overview

UyVision now integrates **Meshy AI** for converting 2D room/furniture images into 3D models. Users can:

1. Upload a room or furniture image (URL)
2. AI converts to high-quality 3D model
3. Download in multiple formats (GLB, OBJ, FBX)
4. Use in design planning

---

## Setup Instructions

### 1. Get Meshy API Key

1. Visit [Meshy Dashboard](https://dashboard.meshy.ai/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Create a new API key
5. Copy the key (you won't see it again)

### 2. Configure Backend

Add to `.env` file:

```env
# Meshy API Configuration
MESHY_API_KEY=your-api-key-here
MESHY_API_URL=https://api.meshy.ai/v2
```

### 3. Test Connection

```bash
# From backend directory
python -c "
from app.services.meshy import get_meshy_client
client = get_meshy_client()
print('Meshy client initialized successfully')
"
```

---

## Usage

### For Users (Frontend)

1. Open AI Builder in Studio
2. Click **📸 3D Generator** tab
3. Enter public URL to image (e.g., `https://example.com/room.jpg`)
4. Click **3D yaratish** (Create 3D)
5. Wait for processing (1-5 minutes)
6. Download model in desired format

### For Developers

#### Python Backend

```python
from app.services.meshy import get_meshy_client

async def convert_room_image():
    meshy = get_meshy_client()
    
    # Start conversion (async)
    result = await meshy.convert_image_to_3d(
        image_url="https://example.com/room.jpg",
        enable_pbr=True,  # Physically-based rendering
        wait=False  # Don't block
    )
    
    # result = {
    #     'task_id': 'abc123...',
    #     'status': 'RUNNING',
    # }
    
    # Or wait for completion
    result = await meshy.convert_image_to_3d(
        image_url="https://example.com/room.jpg",
        wait=True,  # Block until done
        enable_pbr=True
    )
    
    # result = {
    #     'task_id': 'abc123...',
    #     'status': 'SUCCEEDED',
    #     'model_urls': {
    #         'glb': 'https://meshy.ai/download/...',
    #         'obj': 'https://meshy.ai/download/...',
    #         'fbx': 'https://meshy.ai/download/...',
    #     }
    # }
```

#### TypeScript Frontend

```typescript
import { convertImageTo3D, waitForMeshyTask } from '@/lib/api'

async function convertRoom() {
  // Start conversion
  const response = await convertImageTo3D({
    image_url: 'https://example.com/room.jpg',
    enable_pbr: true,
    wait_for_completion: false, // Non-blocking
  })
  
  console.log(response.task_id) // Poll with this
  
  // OR wait for completion
  const result = await waitForMeshyTask(response.task_id)
  
  if (result.status === 'SUCCEEDED') {
    console.log('Model ready:', result.model_urls.glb)
  }
}
```

---

## API Endpoints

### POST `/api/meshy/convert`

**Request:**
```json
{
  "image_url": "https://example.com/room.jpg",
  "enable_pbr": true,
  "wait_for_completion": false
}
```

**Response (async):**
```json
{
  "task_id": "abc123def456",
  "status": "RUNNING",
  "model_urls": {},
  "message": "Conversion initiated"
}
```

**Response (completed):**
```json
{
  "task_id": "abc123def456",
  "status": "SUCCEEDED",
  "model_urls": {
    "glb": "https://meshy.ai/download/abc123.glb",
    "obj": "https://meshy.ai/download/abc123.obj",
    "fbx": "https://meshy.ai/download/abc123.fbx"
  },
  "message": "Conversion completed"
}
```

### GET `/api/meshy/task/{task_id}`

**Response:**
```json
{
  "task_id": "abc123def456",
  "status": "RUNNING",
  "model_urls": {},
  "error": ""
}
```

### POST `/api/meshy/wait/{task_id}`

Polls until completion (up to 5 minutes).

**Response:**
```json
{
  "task_id": "abc123def456",
  "status": "SUCCEEDED",
  "model_urls": {...},
  "message": "3D model ready for download"
}
```

---

## Features

### What Works

✅ Converting room photos to 3D  
✅ Converting furniture images to 3D  
✅ Multiple output formats (GLB, OBJ, FBX)  
✅ Physically-based rendering (PBR) support  
✅ Async/await with proper polling  
✅ Error handling and user feedback  
✅ Batch processing support  

### Limitations

⚠️ **Public URLs only** — Meshy must access the image, so it needs a public URL  
⚠️ **Processing time** — 1-5 minutes depending on complexity  
⚠️ **API rate limits** — Check Meshy plan for limits  
⚠️ **Image quality** — Better source images produce better 3D models  
⚠️ **No private images** — Image data is sent to Meshy servers  

---

## Best Practices

### Image Preparation

1. **Clear lighting** — Well-lit images produce better models
2. **Multiple angles** — If possible, capture from different angles
3. **Clean background** — Minimal clutter around the subject
4. **High resolution** — At least 1024×768 pixels
5. **Public URL** — Use S3, Cloudinary, or similar CDN

### Usage in App

```typescript
// Good: Wait for user feedback
const result = await waitForMeshyTask(taskId)
if (result.status === 'SUCCEEDED') {
  // Download and use model
}

// Bad: Don't poll too frequently
// Use the built-in wait endpoints instead
```

### Error Handling

```typescript
try {
  const result = await convertImageTo3D({
    image_url: imageUrl,
    wait_for_completion: true,
  })
  
  if (result.status === 'FAILED') {
    console.error('Conversion failed:', result.message)
    // Show user-friendly error
  }
} catch (error) {
  console.error('API error:', error)
  // Handle network errors
}
```

---

## Troubleshooting

### "MESHY_API_KEY not configured"

**Solution:** Add `MESHY_API_KEY` to `.env` file

```bash
MESHY_API_KEY=sk_meshy_xxxxx
```

### "Failed to poll Meshy task"

**Possible causes:**
- Network timeout (increase `poll_interval`)
- Task expired (Meshy tasks expire after 24 hours)
- Invalid task ID

**Solution:**
```python
# Increase timeout and interval
result = await meshy.wait_for_completion(
    task_id=task_id,
    max_polls=120,  # More polls
    poll_interval=10.0  # Longer wait
)
```

### "Image URL not accessible"

**Solution:** Ensure image URL is:
- Publicly accessible (no authentication)
- Not blocked by CORS
- Returns actual image content

```bash
# Test URL accessibility
curl -I "https://example.com/image.jpg"
# Should return 200 OK
```

### Models look low quality

**Solutions:**
- Use higher resolution source image
- Try different image angles
- Enable PBR rendering
- Contact Meshy support for quality feedback

---

## Pricing

Meshy offers:

| Plan | Price | Features |
|------|-------|----------|
| Free | $0/month | 5 credits/month (limited) |
| Starter | $10/month | 100 credits/month |
| Pro | $30/month | 500 credits/month |
| Enterprise | Custom | Unlimited |

**Credit usage:**
- Image-to-3D: 1 credit per task
- Check Meshy dashboard for current rates

See [Meshy Pricing](https://www.meshy.ai/pricing)

---

## Integration Architecture

```
User (Frontend)
    ↓
Image3DConverter Component
    ↓ (convertImageTo3D API call)
Backend: /api/meshy/convert
    ↓
MeshyClient.convert_image_to_3d()
    ↓
Meshy API (https://api.meshy.ai/v2)
    ↓
Polling: /api/meshy/task/{task_id}
    ↓
MeshyClient.get_task()
    ↓
Task Completion → Download URLs
    ↓
User downloads 3D model (GLB/OBJ/FBX)
```

---

## Future Enhancements

Potential improvements:

- [ ] 3D preview in browser
- [ ] Drag-and-drop image upload (S3 integration)
- [ ] Auto-upload to room design
- [ ] Batch processing
- [ ] Model caching
- [ ] Custom style options
- [ ] Webhook notifications for completion

---

## Support

### Meshy Documentation
- [Meshy API Docs](https://docs.meshy.ai/)
- [Meshy Dashboard](https://dashboard.meshy.ai/)

### UyVision Support
- Email: rimefara22@gmail.com
- Issues: GitHub repository

---

## Changelog

### Version 1.0.0 (2026-07-24)
- Initial Meshy integration
- Image-to-3D conversion support
- Multiple format downloads (GLB, OBJ, FBX)
- Async polling with timeout
- Frontend UI component
- API endpoints with authentication

---

**Last Updated:** 2026-07-24  
**Status:** ✅ Production Ready
