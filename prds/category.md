# TaskHub Category & User Flow Proposal

## 1. Overview
This document outlines a clean and scalable structure for TaskHub categories, task posting, and tasker onboarding.  
The goal is to improve user clarity, task matching, and overall platform usability.

---

## 2. Core Structure

### Main Categories (Frontend / UX)
- Local Services  
- Campus Tasks  
- Errands & Deliveries  

### Subcategories (Backend / Logic)
These are the real categories used for matching and filtering.

**Examples:**

**Local Services**
- Electrician  
- Plumber  
- Cleaner  
- AC Repair  
- Generator Repair  
- Mechanic  

**Campus Tasks**
- Printing / Photocopy  
- Laundry Pickup  
- Hostel Moving Help  
- Assignment Typing  
- Tech Help  
- Campus Photography  

**Errands & Deliveries**
- Grocery Shopping  
- Food Delivery  
- Parcel Pickup  
- Parcel Drop-off  
- Pharmacy Pickup  
- Document Delivery  

---

## 3. User Flow (Posting a Task)

**Step 1:** User clicks a main category on homepage  
**Step 2:** User selects a subcategory  
**Step 3:** Task form opens with category pre-filled  

**Form Fields:**
- Task Title  
- Budget  
- Deadline  
- Description  
- Location  

---

## 4. Category Logic
- Each task belongs to **ONE** main category.  
- Subcategories define the actual service.  
- Same subcategory can exist in different contexts.  

**Example:**
- Campus Tasks → Electrician (hostel)  
- Local Services → Electrician (home)  

---

## 5. University Selection
- Only required for **Campus Tasks**.  
- Helps filter tasks by school.  
- Not required for Local Services or Errands.  

---

## 6. Tasker Onboarding Flow

**Step 1:** Select main category (or multiple)  
**Step 2:** Select subcategories within each  
**Step 3:** If Campus selected → choose university  

**Example:**
- Local Services → Electrician  
- Errands → Delivery  

---

## 7. Backend Structure Example
Each task stores:
- `mainCategory`  
- `subCategory`  
- `user`  
- `budget`  
- `location`  
- `status`  

---

## 8. Immediate Improvements
- Make homepage categories clickable  
- Add subcategory selection screen  
- Update post task form to include subcategory  
- Prefill form based on selection  
- Add university only for campus tasks  

---

## 9. Summary
- **Main categories** = navigation  
- **Subcategories** = real logic  
- **University** = campus filtering only  
- **Matching** = based on subcategory  

This structure ensures clarity, scalability, and better user experience.