Endpoint: POST /api/nin/submit-nin 
Description: Verifies a user's National Identity Number (NIN) directly against the NIMC database. Automatically extracts the user's real name, date of birth, and official photo.
Authorization: Bearer <User_or_Tasker_Token>

Important Change: The frontend no longer needs to send firstName, lastName, or dob. The backend now securely fetches and validates this data directly from the government database to prevent user manipulation.

JSON
{
  "nin": "12345678901",
  "selfieImage": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ..." 
}
Success Response (200 OK)
Returns the official NIMC data, including the Base64 image string which can be rendered directly in an <img src="data:image/jpeg;base64,..."> tag.

JSON
{
    "status": "success",
    "message": "NIN verified successfully",
    "isVerified": true,
    "kycId": "69e946cb97e3d8b1faa3b8927",
    "ninDetails": {
        "transaction_id": "430431322341143604666",
        "reference_id": "REF-2F1875220400",
        "requestID": "LYR6405C62EB",
        "fname": "JOHN",
        "mname": "CHUKWUEDI",
        "lname": "DOE",
        "dob": "11-11-1995",
        "phone": "08012345678",
        "stateOfOrigin": "Lagos",
        "image": "/9j/4AAQSkZJRgABAQAAAQABAAD...", // Base64 Photo String
        "validation_units_before": 2399,
        "validation_units_after": 2398
    }
}
Error Responses (400 Bad Request)
Scenario 1: Missing NIN

JSON
{
    "status": "error",
    "message": "NIN is strictly required"
}
Scenario 2: Underage User (< 18 years old)
(Calculated automatically using the official NIMC Date of Birth)

JSON
{
    "status": "error",
    "message": "KYC rejected: User is 17 years old. Must be 18 or older."
}
Scenario 3: Invalid NIN (Rejected by Vuvaa/NIMC)

JSON
{
    "status": "error",
    "message": "NIN verification failed or pending manual review",
    "isVerified": false,
    "vuvaaMessage": "Verification failed: Invalid NIN"
}