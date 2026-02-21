--------------------------- MODULE HGate_Boot ---------------------------
EXTENDS Naturals, Sequences

VARIABLES 
    state,        \* Boot FSM state
    pcr,          \* Platform Configuration Register (abstracted as a sequence of hashes)
    counter,      \* Anti-rollback counter
    is_locked     \* Security lockdown flag

(* Constants representing valid hashes/signatures for the boot sequence *)
CONSTANTS 
    ValidGateHash,
    ValidVMHash,
    ValidPolicyHash

Init == 
    /\ state = "RESET"
    /\ pcr = << >>
    /\ counter = 0
    /\ is_locked = FALSE

(* Transition: Verify Gate Binary *)
VerifyGate(hash, is_valid) ==
    /\ state = "RESET"
    /\ ~is_locked
    /\ IF is_valid 
       THEN /\ state' = "VERIFY_VM"
            /\ pcr' = Append(pcr, hash)
            /\ UNCHANGED <<counter, is_locked>>
       ELSE /\ state' = "FAULT"
            /\ is_locked' = TRUE
            /\ UNCHANGED <<pcr, counter>>

(* Transition: Verify Decision VM *)
VerifyVM(hash, is_valid) ==
    /\ state = "VERIFY_VM"
    /\ ~is_locked
    /\ IF is_valid 
       THEN /\ state' = "VERIFY_POLICY"
            /\ pcr' = Append(pcr, hash)
            /\ UNCHANGED <<counter, is_locked>>
       ELSE /\ state' = "FAULT"
            /\ is_locked' = TRUE
            /\ UNCHANGED <<pcr, counter>>

(* Transition: Verify Policy Epoch *)
VerifyPolicy(hash, epoch, is_valid) ==
    /\ state = "VERIFY_POLICY"
    /\ ~is_locked
    /\ IF is_valid /\ (epoch >= counter)
       THEN /\ state' = "RUN"
            /\ pcr' = Append(pcr, hash)
            /\ counter' = epoch  \* Update anti-rollback watermark
            /\ UNCHANGED is_locked
       ELSE /\ state' = "FAULT"
            /\ is_locked' = TRUE
            /\ UNCHANGED <<pcr, counter>>

(* Next State Relation *)
Next == 
    \/ \E h \in {ValidGateHash, "Invalid"}, v \in BOOLEAN : VerifyGate(h, v)
    \/ \E h \in {ValidVMHash, "Invalid"}, v \in BOOLEAN : VerifyVM(h, v)
    \/ \E h \in {ValidPolicyHash, "Invalid"}, e \in Nat, v \in BOOLEAN : VerifyPolicy(h, e, v)

Spec == Init /\ [][Next]_<<state, pcr, counter, is_locked>>

-------------------------------------------------------------------------
(* Security Properties to be verified by TLC Model Checker *)

(* Theorem: The system only reaches RUN if all verifications passed and it is not locked *)
SafeBoot == 
    (state = "RUN") => (~is_locked /\ Len(pcr) = 3)

(* Theorem: The anti-rollback counter never decreases *)
CounterMonotonic == 
    [][counter' >= counter]_<<state, pcr, counter, is_locked>>

(* Theorem: Once locked, the system can never reach RUN *)
LockdownIsTerminal == 
    [](is_locked => [](state # "RUN"))

=========================================================================
