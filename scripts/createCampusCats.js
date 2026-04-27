import mongoose from "mongoose";
import dotenv from "dotenv";
import Category from "../models/category.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

// your parent category ID
const PARENT_ID = "69da32fc1bd35b87450b50de";

// flat list of all categories
const categories = [
  "Printing & Photocopying",
  "Assignment Typing",
  "Research Assistance",
  "Project Help",
  "Note Taking",
  "Tutoring",
  "Exam Revision Help",
  "Proofreading & Editing",
  "Presentation Slides Design",

  "Laundry Services",
  "Ironing Clothes",
  "Room Cleaning",
  "Hostel Cleaning",
  "Hostel Moving Help",
  "Packing & Unpacking",
  "Off-campus Accommodation Assistance (Bargate & Main Gate)",
  "On-campus Accommodation Assistance (Lecturer Quarters & Hostel)",

  "Tech Setup",
  "Phone Setup",
  "Laptop Setup",
  "Software Installation",
  "Device Troubleshooting",
  "Data Transfer",

  "Hair Styling",
  "Hair Braiding",
  "Wig Installation",
  "Wig Revamping",
  "Barbering / Haircuts",
  "Makeup Services",
  "Nail Services",
  "Lash Installation",
  "Brows",
  "Henna Design",
  "Gele Tying",
  "Massage Services",
  "Personal Styling",

  "Photography",
  "Videography",
  "Content Creation",
  "Content Writing",
  "Social Media Content Design",
  "Flyer / Poster Design",
  "Voice-over Recording",
  "UGC Content Creation",
  "Modeling",
];

const createCategories = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    const parentObjectId = new mongoose.Types.ObjectId(PARENT_ID);

    for (const name of categories) {
      // 👇 this is the magic: update if exists, create if not
      await Category.findOneAndUpdate(
        { name, parentCategory: parentObjectId }, // match condition
        {
          name,
          displayName: name,
          parentCategory: parentObjectId,
          isActive: true,
          minimumPrice: 15000,
        },
        {
          upsert: true, // create if not exists
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      console.log(`✔ Processed: ${name}`);
    }

    console.log("🎉 All categories processed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating categories:", error);
    process.exit(1);
  }
};

createCategories();
