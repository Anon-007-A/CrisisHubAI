import asyncio, json
from google.cloud import firestore
import os
from dotenv import load_dotenv

load_dotenv()

async def seed():
    db = firestore.AsyncClient(project=os.getenv('FIRESTORE_PROJECT_ID'))
    with open('data/responders_seed.json') as f:
        responders = json.load(f)
    for r in responders:
        await db.collection('responders').document(r['id']).set(r)
    print(f'Seeded {len(responders)} responders')

if __name__ == '__main__':
    asyncio.run(seed())
