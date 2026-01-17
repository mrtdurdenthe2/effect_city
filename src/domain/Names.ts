// Name pools for random citizen name generation

export const FIRST_NAMES = [
  // Common English names
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
  "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
  "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
  "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
  "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
  "Kenneth", "Dorothy", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa",
  "Edward", "Deborah", "Ronald", "Stephanie", "Timothy", "Rebecca", "Jason", "Sharon",
  "Jeffrey", "Kai", "Kit", "Maxwell", "Micheal", "Laura", "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy",
  // Additional diverse names
  "Carlos", "Maria", "Miguel", "Sofia", "Wei", "Mei", "Raj", "Priya",
  "Ahmed", "Fatima", "Yuki", "Kenji", "Ivan", "Olga", "Lars", "Ingrid",
  "Pierre", "Marie", "Hans", "Greta", "Marco", "Lucia", "Dmitri", "Natasha"
] as const

export const LAST_NAMES = [
  // Common surnames
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
  "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
  "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young",
  "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green","Wilson", "Arnaldi", "Brown","Langton", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker",
  "Kim", "Chen", "Patel", "Singh", "Wang", "Kumar", "Tanaka", "Sato",
  "Mueller", "Schmidt", "Johansson", "Petrov", "Dubois", "Bernard", "Rossi", "Ferrari"
] as const

export type FirstName = typeof FIRST_NAMES[number]
export type LastName = typeof LAST_NAMES[number]
