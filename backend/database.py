import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.environ.get("MONGO_URI", "mongodb+srv://anmolsah064444_db_user:IyLJruoqDB1sn5I5@cluster0.egjeby1.mongodb.net/?appName=Cluster0")

client = MongoClient(MONGO_URI)
db = client["college_practicals"]
practicals_collection = db["practicals"]

print("Connected to MongoDB successfully!")
