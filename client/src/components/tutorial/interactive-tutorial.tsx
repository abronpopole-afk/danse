import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";

interface Step {
  title: string;
  description: string;
  target?: string;
}

const steps: Step[] = [
  {
    title: "Bienvenue sur GTO Poker Bot",
    description: "Ce tutoriel va vous guider à travers les fonctionnalités de base pour commencer votre première session.",
  },
  {
    title: "Démarrer une Session",
    description: "Utilisez le bouton 'DÉMARRER SESSION' en haut à droite pour initialiser le moteur de jeu et la connexion à la base de données.",
    target: "button-start-session",
  },
  {
    title: "Ajouter des Tables",
    description: "Une fois la session démarrée, vous pouvez ajouter vos tables GGClub en cliquant sur 'NOUVELLE TABLE'.",
    target: "button-add-table",
  },
  {
    title: "Surveillance GTO",
    description: "Le panneau central affiche la table sélectionnée et les décisions GTO prises en temps réel par le bot.",
  },
  {
    title: "Humanizer & Profil",
    description: "Ajustez les paramètres d'humanisation et gérez le profil psychologique du bot (tilt, agressivité) dans les panneaux de droite.",
  },
];

export function InteractiveTutorial() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem("gto_tutorial_completed");
    if (!hasSeenTutorial) {
      setIsOpen(true);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem("gto_tutorial_completed", "true");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {currentStep + 1}
            </span>
            {steps[currentStep].title}
          </DialogTitle>
          <DialogDescription className="pt-2 text-base">
            {steps[currentStep].description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-between items-center mt-4">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  i === currentStep ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between items-center mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Retour
          </Button>
          <Button size="sm" onClick={handleNext}>
            {currentStep === steps.length - 1 ? (
              <>
                Terminer
                <CheckCircle2 className="w-4 h-4 ml-2" />
              </>
            ) : (
              <>
                Suivant
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
